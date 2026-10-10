<?php
/**
 * Orders, payouts and payment gateways (free, bank, toss).
 *
 * @package UTLC
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Orders {

	const TOSS_API = 'https://api.tosspayments.com/v1/payments/';

	public static function init() {
		add_action( 'wp_ajax_utlc_create_order', array( __CLASS__, 'ajax_create_order' ) );
		add_action( 'wp_ajax_nopriv_utlc_create_order', array( __CLASS__, 'ajax_create_order' ) );
		add_action( 'wp_ajax_utlc_cancel_order', array( __CLASS__, 'ajax_cancel_order' ) );
		add_action( 'wp_ajax_nopriv_utlc_cancel_order', array( __CLASS__, 'ajax_cancel_order' ) );
	}

	/* ---------------------------------------------------------------- helpers */

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'utlc_orders';
	}

	public static function payouts_table() {
		global $wpdb;
		return $wpdb->prefix . 'utlc_payouts';
	}

	public static function opt( $key, $default = null ) {
		if ( function_exists( 'utlc_opt' ) ) {
			$v = utlc_opt( $key );
			return ( null === $v ) ? $default : $v;
		}
		return $default;
	}

	public static function status_label( $status ) {
		$labels = array(
			'pending'   => '결제 대기',
			'paid'      => '결제 완료',
			'cancelled' => '취소됨',
			'refunded'  => '환불됨',
			'failed'    => '결제 실패',
			'requested' => '정산 요청',
			'rejected'  => '반려',
		);
		return isset( $labels[ $status ] ) ? $labels[ $status ] : $status;
	}

	public static function gateway_label( $gateway ) {
		$labels = array(
			'free' => '무료',
			'bank' => '무통장입금',
			'toss' => '카드결제 (토스페이먼츠)',
		);
		return isset( $labels[ $gateway ] ) ? $labels[ $gateway ] : $gateway;
	}

	public static function toss_enabled() {
		return (bool) self::opt( 'gateway_toss', 0 ) && '' !== (string) self::opt( 'toss_client_key', '' ) && '' !== (string) self::opt( 'toss_secret_key', '' );
	}

	/**
	 * Available gateways: id => label.
	 */
	public static function gateways( $listing_id = 0 ) {
		$g = array();
		if ( $listing_id ) {
			$price = (int) get_post_meta( $listing_id, '_utlc_price', true );
			if ( $price <= 0 ) {
				$g['free'] = '무료로 받기';
			} else {
				if ( self::opt( 'gateway_bank', 1 ) ) {
					$g['bank'] = self::gateway_label( 'bank' );
				}
				if ( self::toss_enabled() ) {
					$g['toss'] = self::gateway_label( 'toss' );
				}
			}
		} else {
			$g = array(
				'free' => self::gateway_label( 'free' ),
				'bank' => self::gateway_label( 'bank' ),
				'toss' => self::gateway_label( 'toss' ),
			);
		}
		return apply_filters( 'utlc_gateways', $g, $listing_id );
	}

	public static function new_key() {
		return 'UTLC' . gmdate( 'ymdHis' ) . '-' . wp_generate_password( 10, false );
	}

	public static function checkout_url( $order_key ) {
		return home_url( '/checkout/' . rawurlencode( $order_key ) . '/' );
	}

	public static function download_url( $listing_id ) {
		return home_url( '/utlc-download/' . (int) $listing_id . '/' );
	}

	/* ---------------------------------------------------------------- CRUD */

	public static function create( $listing_id, $buyer_id, $gateway, $args = array() ) {
		global $wpdb;
		$listing_id = (int) $listing_id;
		$buyer_id   = (int) $buyer_id;
		$post       = get_post( $listing_id );

		if ( ! $post || 'utlc_post' !== $post->post_type || 'model' !== get_post_meta( $listing_id, '_utlc_kind', true ) || 'publish' !== $post->post_status ) {
			return new WP_Error( 'utlc_listing', '판매 중인 상품이 아닙니다.' );
		}
		if ( ! $buyer_id ) {
			return new WP_Error( 'utlc_login', '로그인이 필요합니다.' );
		}
		$seller_id = (int) $post->post_author;
		if ( $seller_id === $buyer_id ) {
			return new WP_Error( 'utlc_self', '본인이 등록한 상품은 구매할 수 없습니다.' );
		}
		$gateways = self::gateways( $listing_id );
		if ( ! isset( $gateways[ $gateway ] ) ) {
			return new WP_Error( 'utlc_gateway', '사용할 수 없는 결제 수단입니다.' );
		}
		if ( self::has_purchased( $buyer_id, $listing_id ) ) {
			return new WP_Error( 'utlc_bought', '이미 구매한 상품입니다.' );
		}

		// Server-side price only.
		$price     = max( 0, (int) get_post_meta( $listing_id, '_utlc_price', true ) );
		$rate      = max( 0, min( 100, (float) self::opt( 'commission_rate', 20 ) ) );
		$fee       = (int) round( $price * $rate / 100 );
		$seller_am = $price - $fee;
		$depositor = isset( $args['depositor'] ) ? mb_substr( sanitize_text_field( $args['depositor'] ), 0, 100 ) : '';
		$now       = current_time( 'mysql', true );
		$table     = self::table();

		// Reuse same pending order.
		$existing = $wpdb->get_row( $wpdb->prepare(
			"SELECT * FROM {$table} WHERE listing_id = %d AND buyer_id = %d AND status = 'pending' AND gateway = %s AND amount = %d ORDER BY id DESC LIMIT 1",
			$listing_id, $buyer_id, $gateway, $price
		) );
		if ( $existing ) {
			$wpdb->update( $table, array( 'depositor' => $depositor, 'updated_at' => $now ), array( 'id' => $existing->id ), array( '%s', '%s' ), array( '%d' ) );
			return self::get( $existing->id );
		}

		$ok = $wpdb->insert(
			$table,
			array(
				'order_key'     => self::new_key(),
				'listing_id'    => $listing_id,
				'buyer_id'      => $buyer_id,
				'seller_id'     => $seller_id,
				'amount'        => $price,
				'fee_amount'    => $fee,
				'seller_amount' => $seller_am,
				'status'        => 'pending',
				'gateway'       => $gateway,
				'payment_key'   => '',
				'depositor'     => $depositor,
				'note'          => '',
				'created_at'    => $now,
				'updated_at'    => $now,
			),
			array( '%s', '%d', '%d', '%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
		if ( ! $ok ) {
			return new WP_Error( 'utlc_db', '주문을 생성하지 못했습니다.' );
		}
		return self::get( $wpdb->insert_id );
	}

	public static function get( $id ) {
		global $wpdb;
		$table = self::table();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", (int) $id ) );
	}

	public static function get_by_key( $key ) {
		global $wpdb;
		$table = self::table();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE order_key = %s", (string) $key ) );
	}

	public static function mark_paid( $order_id, $payment_key = '' ) {
		global $wpdb;
		$order = self::get( $order_id );
		if ( ! $order ) {
			return new WP_Error( 'utlc_order', '주문을 찾을 수 없습니다.' );
		}
		if ( 'paid' === $order->status ) {
			return true;
		}
		if ( 'refunded' === $order->status ) {
			return new WP_Error( 'utlc_order', '환불된 주문입니다.' );
		}
		$table = self::table();
		$now   = current_time( 'mysql', true );
		$pkey  = '' !== $payment_key ? $payment_key : (string) $order->payment_key;
		$rows  = $wpdb->query( $wpdb->prepare(
			"UPDATE {$table} SET status = 'paid', paid_at = %s, updated_at = %s, payment_key = %s WHERE id = %d AND status <> 'paid'",
			$now, $now, $pkey, (int) $order->id
		) );
		if ( ! $rows ) {
			return true; // Already processed concurrently.
		}

		$count = (int) get_post_meta( $order->listing_id, '_utlc_sales_count', true );
		update_post_meta( $order->listing_id, '_utlc_sales_count', $count + 1 );

		$order = self::get( $order->id );
		self::send_paid_emails( $order );
		do_action( 'utlc_order_paid', $order );
		return true;
	}

	protected static function send_paid_emails( $order ) {
		$site   = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
		$title  = wp_strip_all_tags( get_the_title( $order->listing_id ) );
		$buyer  = get_userdata( $order->buyer_id );
		$seller = get_userdata( $order->seller_id );
		$amount = function_exists( 'utlc_krw' ) ? utlc_krw( $order->amount ) : number_format( (int) $order->amount ) . '원';

		if ( $buyer && $buyer->user_email ) {
			wp_mail(
				$buyer->user_email,
				sprintf( '[%s] 구매가 완료되었습니다: %s', $site, $title ),
				sprintf( "주문번호: %s\n상품: %s\n금액: %s\n\n다운로드: %s\n주문 확인: %s", $order->order_key, $title, $amount, self::download_url( $order->listing_id ), self::checkout_url( $order->order_key ) )
			);
		}
		if ( $seller && $seller->user_email ) {
			wp_mail(
				$seller->user_email,
				sprintf( '[%s] 상품이 판매되었습니다: %s', $site, $title ),
				sprintf( "주문번호: %s\n상품: %s\n판매 금액: %s\n정산 예정 금액: %s", $order->order_key, $title, $amount, number_format( (int) $order->seller_amount ) . '원' )
			);
		}
		wp_mail(
			get_option( 'admin_email' ),
			sprintf( '[%s] 주문 결제 완료: %s', $site, $order->order_key ),
			sprintf( "주문번호: %s\n상품: %s (#%d)\n금액: %s\n수수료: %s\n결제수단: %s", $order->order_key, $title, $order->listing_id, $amount, number_format( (int) $order->fee_amount ) . '원', self::gateway_label( $order->gateway ) )
		);
	}

	public static function set_status( $id, $status, $note = '' ) {
		global $wpdb;
		$allowed = array( 'pending', 'paid', 'cancelled', 'refunded', 'failed' );
		if ( ! in_array( $status, $allowed, true ) ) {
			return false;
		}
		if ( 'paid' === $status ) {
			return self::mark_paid( $id );
		}
		$order = self::get( $id );
		if ( ! $order ) {
			return false;
		}
		$new_note = (string) $order->note;
		if ( '' !== $note ) {
			$new_note = trim( $new_note . "\n[" . current_time( 'mysql' ) . '] ' . sanitize_textarea_field( $note ) );
		}
		$wpdb->update(
			self::table(),
			array( 'status' => $status, 'note' => $new_note, 'updated_at' => current_time( 'mysql', true ) ),
			array( 'id' => (int) $id ),
			array( '%s', '%s', '%s' ),
			array( '%d' )
		);
		if ( 'paid' === $order->status && 'paid' !== $status ) {
			$count = (int) get_post_meta( $order->listing_id, '_utlc_sales_count', true );
			update_post_meta( $order->listing_id, '_utlc_sales_count', max( 0, $count - 1 ) );
		}
		do_action( 'utlc_order_status', (int) $id, $status, $order->status );
		return true;
	}

	public static function has_purchased( $user_id, $listing_id ) {
		global $wpdb;
		if ( ! $user_id ) {
			return false;
		}
		$table = self::table();
		return (bool) $wpdb->get_var( $wpdb->prepare(
			"SELECT id FROM {$table} WHERE buyer_id = %d AND listing_id = %d AND status = 'paid' LIMIT 1",
			(int) $user_id, (int) $listing_id
		) );
	}

	public static function pending_for( $user_id, $listing_id ) {
		global $wpdb;
		$table = self::table();
		return $wpdb->get_row( $wpdb->prepare(
			"SELECT * FROM {$table} WHERE buyer_id = %d AND listing_id = %d AND status = 'pending' ORDER BY id DESC LIMIT 1",
			(int) $user_id, (int) $listing_id
		) );
	}

	public static function for_buyer( $uid, $limit = 100 ) {
		global $wpdb;
		$table = self::table();
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE buyer_id = %d ORDER BY id DESC LIMIT %d", (int) $uid, (int) $limit ) );
	}

	public static function for_seller( $uid, $limit = 100 ) {
		global $wpdb;
		$table = self::table();
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE seller_id = %d ORDER BY id DESC LIMIT %d", (int) $uid, (int) $limit ) );
	}

	public static function payouts_for( $uid, $limit = 50 ) {
		global $wpdb;
		$table = self::payouts_table();
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE seller_id = %d ORDER BY id DESC LIMIT %d", (int) $uid, (int) $limit ) );
	}

	public static function balance( $uid ) {
		global $wpdb;
		$ot     = self::table();
		$pt     = self::payouts_table();
		$earned = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(seller_amount),0) FROM {$ot} WHERE seller_id = %d AND status = 'paid'", (int) $uid ) );
		$paid   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount),0) FROM {$pt} WHERE seller_id = %d AND status = 'paid'", (int) $uid ) );
		$pend   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount),0) FROM {$pt} WHERE seller_id = %d AND status = 'requested'", (int) $uid ) );
		return array(
			'earned'    => $earned,
			'paid_out'  => $paid,
			'pending'   => $pend,
			'available' => max( 0, $earned - $paid - $pend ),
		);
	}

	public static function request_payout( $uid, $amount, $bank_info ) {
		global $wpdb;
		$uid       = (int) $uid;
		$amount    = (int) $amount;
		$bank_info = sanitize_textarea_field( $bank_info );
		$min       = (int) self::opt( 'min_payout', 10000 );
		$bal       = self::balance( $uid );

		if ( ! $uid ) {
			return new WP_Error( 'utlc_login', '로그인이 필요합니다.' );
		}
		if ( $amount < $min ) {
			return new WP_Error( 'utlc_payout', sprintf( '최소 정산 요청 금액은 %s원입니다.', number_format( $min ) ) );
		}
		if ( $amount > $bal['available'] ) {
			return new WP_Error( 'utlc_payout', '출금 가능 금액을 초과했습니다.' );
		}
		if ( mb_strlen( trim( $bank_info ) ) < 5 ) {
			return new WP_Error( 'utlc_payout', '정산받을 계좌 정보(은행, 계좌번호, 예금주)를 입력하세요.' );
		}
		$ok = $wpdb->insert(
			self::payouts_table(),
			array(
				'seller_id'  => $uid,
				'amount'     => $amount,
				'status'     => 'requested',
				'bank_info'  => $bank_info,
				'admin_note' => '',
				'created_at' => current_time( 'mysql', true ),
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s' )
		);
		if ( ! $ok ) {
			return new WP_Error( 'utlc_db', '정산 요청을 저장하지 못했습니다.' );
		}
		$id   = (int) $wpdb->insert_id;
		$user = get_userdata( $uid );
		wp_mail(
			get_option( 'admin_email' ),
			sprintf( '[%s] 정산 요청 #%d', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $id ),
			sprintf( "판매자: %s (#%d)\n금액: %s원", $user ? $user->user_login : '', $uid, number_format( $amount ) )
		);
		do_action( 'utlc_payout_requested', $id, $uid, $amount );
		return $id;
	}

	/* ---------------------------------------------------------------- Toss */

	protected static function toss_headers() {
		return array(
			'Authorization' => 'Basic ' . base64_encode( (string) self::opt( 'toss_secret_key', '' ) . ':' ),
			'Content-Type'  => 'application/json',
		);
	}

	protected static function toss_request( $method, $path, $body = null ) {
		$args = array(
			'method'  => $method,
			'timeout' => 30,
			'headers' => self::toss_headers(),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		$res = wp_remote_request( self::TOSS_API . $path, $args );
		if ( is_wp_error( $res ) ) {
			return array( 'code' => 0, 'body' => array( 'message' => $res->get_error_message() ) );
		}
		$data = json_decode( wp_remote_retrieve_body( $res ), true );
		return array( 'code' => (int) wp_remote_retrieve_response_code( $res ), 'body' => is_array( $data ) ? $data : array() );
	}

	public static function handle_return( $gateway, $result ) {
		nocache_headers();
		$order_key = isset( $_GET['orderId'] ) ? sanitize_text_field( wp_unslash( $_GET['orderId'] ) ) : '';
		$order     = $order_key ? self::get_by_key( $order_key ) : null;

		if ( 'toss' !== $gateway || ! $order || 'toss' !== $order->gateway ) {
			wp_safe_redirect( home_url( '/' ) );
			exit;
		}
		$redirect = self::checkout_url( $order->order_key );

		if ( 'fail' === $result ) {
			if ( 'pending' === $order->status && (int) $order->buyer_id === get_current_user_id() ) {
				$code = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';
				$msg  = isset( $_GET['message'] ) ? sanitize_text_field( wp_unslash( $_GET['message'] ) ) : '';
				self::set_status( $order->id, 'failed', trim( '결제 실패 ' . $code . ' ' . $msg ) );
			}
			if ( function_exists( 'utlc_flash' ) ) {
				utlc_flash( '결제가 완료되지 않았습니다.', 'error' );
			}
			wp_safe_redirect( $redirect );
			exit;
		}

		// success.
		if ( 'paid' === $order->status ) {
			wp_safe_redirect( $redirect );
			exit;
		}
		$payment_key = isset( $_GET['paymentKey'] ) ? sanitize_text_field( wp_unslash( $_GET['paymentKey'] ) ) : '';
		$amount      = isset( $_GET['amount'] ) ? (int) $_GET['amount'] : -1;
		$uid         = get_current_user_id();

		if ( 'pending' !== $order->status || ! $uid || (int) $order->buyer_id !== $uid || $amount !== (int) $order->amount || '' === $payment_key ) {
			if ( function_exists( 'utlc_flash' ) ) {
				utlc_flash( '결제 정보가 주문과 일치하지 않습니다.', 'error' );
			}
			wp_safe_redirect( $redirect );
			exit;
		}

		$res = self::toss_request( 'POST', 'confirm', array(
			'paymentKey' => $payment_key,
			'orderId'    => $order->order_key,
			'amount'     => (int) $order->amount,
		) );

		$paid = false;
		if ( 200 === $res['code'] && isset( $res['body']['status'] ) && 'DONE' === $res['body']['status'] ) {
			$paid = true;
		} elseif ( isset( $res['body']['code'] ) && 'ALREADY_PROCESSED_PAYMENT' === $res['body']['code'] ) {
			$chk = self::toss_request( 'GET', rawurlencode( $payment_key ) );
			if ( 200 === $chk['code'] && isset( $chk['body']['status'], $chk['body']['orderId'], $chk['body']['totalAmount'] )
				&& 'DONE' === $chk['body']['status'] && $chk['body']['orderId'] === $order->order_key && (int) $chk['body']['totalAmount'] === (int) $order->amount ) {
				$paid = true;
			}
		}

		if ( $paid ) {
			self::mark_paid( $order->id, $payment_key );
			if ( function_exists( 'utlc_flash' ) ) {
				utlc_flash( '결제가 완료되었습니다. 이제 다운로드할 수 있습니다.', 'success' );
			}
		} else {
			$msg = isset( $res['body']['message'] ) ? (string) $res['body']['message'] : '결제 승인 실패';
			self::set_status( $order->id, 'failed', '토스 승인 실패: ' . $msg );
			if ( function_exists( 'utlc_flash' ) ) {
				utlc_flash( '결제 승인에 실패했습니다: ' . $msg, 'error' );
			}
		}
		wp_safe_redirect( $redirect );
		exit;
	}

	public static function refund( $order_id, $reason = '' ) {
		$order = self::get( $order_id );
		if ( ! $order ) {
			return new WP_Error( 'utlc_order', '주문을 찾을 수 없습니다.' );
		}
		if ( 'refunded' === $order->status ) {
			return true;
		}
		$reason = '' !== $reason ? $reason : '관리자 환불';
		if ( 'toss' === $order->gateway && 'paid' === $order->status && '' !== (string) $order->payment_key ) {
			$res = self::toss_request( 'POST', rawurlencode( $order->payment_key ) . '/cancel', array( 'cancelReason' => mb_substr( $reason, 0, 200 ) ) );
			if ( 200 !== $res['code'] ) {
				$msg = isset( $res['body']['message'] ) ? $res['body']['message'] : '토스 결제 취소 실패';
				return new WP_Error( 'utlc_toss', $msg );
			}
		}
		self::set_status( $order->id, 'refunded', '환불: ' . $reason );
		return true;
	}

	/* ---------------------------------------------------------------- AJAX */

	protected static function verify_ajax() {
		if ( function_exists( 'utlc_verify_ajax' ) ) {
			utlc_verify_ajax( true );
			return;
		}
		if ( ! check_ajax_referer( 'utlc_nonce', 'nonce', false ) ) {
			wp_send_json_error( array( 'message' => '보안 토큰이 만료되었습니다. 새로고침 후 다시 시도하세요.' ), 403 );
		}
		if ( ! is_user_logged_in() ) {
			wp_send_json_error( array( 'message' => '로그인이 필요합니다.' ), 401 );
		}
	}

	public static function ajax_create_order() {
		self::verify_ajax();
		$uid        = get_current_user_id();
		$listing_id = isset( $_POST['listing_id'] ) ? absint( $_POST['listing_id'] ) : 0;
		$gateway    = isset( $_POST['gateway'] ) ? sanitize_key( wp_unslash( $_POST['gateway'] ) ) : '';
		$depositor  = isset( $_POST['depositor'] ) ? sanitize_text_field( wp_unslash( $_POST['depositor'] ) ) : '';
		$agree      = ! empty( $_POST['agree'] );

		if ( function_exists( 'utlc_rate_limited' ) && utlc_rate_limited( 'order_' . $uid, 30, HOUR_IN_SECONDS ) ) {
			wp_send_json_error( array( 'message' => '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' ), 429 );
		}
		$price = (int) get_post_meta( $listing_id, '_utlc_price', true );
		if ( $price > 0 && ! $agree ) {
			wp_send_json_error( array( 'message' => '환불 규정에 동의해 주세요.' ), 400 );
		}
		if ( 'bank' === $gateway && '' === trim( $depositor ) ) {
			wp_send_json_error( array( 'message' => '입금자명을 입력하세요.' ), 400 );
		}

		$order = self::create( $listing_id, $uid, $gateway, array( 'depositor' => $depositor ) );
		if ( is_wp_error( $order ) ) {
			wp_send_json_error( array( 'message' => $order->get_error_message() ), 400 );
		}

		if ( 'free' === $order->gateway ) {
			self::mark_paid( $order->id, 'free' );
			wp_send_json_success( array( 'type' => 'paid', 'download_url' => self::download_url( $listing_id ) ) );
		}
		if ( 'bank' === $order->gateway ) {
			wp_send_json_success( array( 'type' => 'redirect', 'url' => self::checkout_url( $order->order_key ) ) );
		}
		if ( 'toss' === $order->gateway ) {
			$user = wp_get_current_user();
			wp_send_json_success( array(
				'type'          => 'toss',
				'clientKey'     => (string) self::opt( 'toss_client_key', '' ),
				'customerKey'   => 'utlc_' . substr( md5( $uid . wp_salt( 'auth' ) ), 0, 24 ),
				'amount'        => (int) $order->amount,
				'orderId'       => $order->order_key,
				'orderName'     => mb_substr( wp_strip_all_tags( html_entity_decode( get_the_title( $listing_id ), ENT_QUOTES, 'UTF-8' ) ), 0, 90 ),
				'successUrl'    => home_url( '/utlc-pay/toss/success/' ),
				'failUrl'       => home_url( '/utlc-pay/toss/fail/' ),
				'customerEmail' => $user->user_email,
				'customerName'  => mb_substr( $user->display_name, 0, 50 ),
			) );
		}
		wp_send_json_error( array( 'message' => '지원하지 않는 결제 수단입니다.' ), 400 );
	}

	public static function ajax_cancel_order() {
		self::verify_ajax();
		$key   = isset( $_POST['order_key'] ) ? sanitize_text_field( wp_unslash( $_POST['order_key'] ) ) : '';
		$order = $key ? self::get_by_key( $key ) : null;
		if ( ! $order || (int) $order->buyer_id !== get_current_user_id() ) {
			wp_send_json_error( array( 'message' => '주문을 찾을 수 없습니다.' ), 404 );
		}
		if ( 'pending' !== $order->status ) {
			wp_send_json_error( array( 'message' => '결제 대기 중인 주문만 취소할 수 있습니다.' ), 400 );
		}
		self::set_status( $order->id, 'cancelled', '구매자 취소' );
		wp_send_json_success( array( 'message' => '주문이 취소되었습니다.' ) );
	}
}
