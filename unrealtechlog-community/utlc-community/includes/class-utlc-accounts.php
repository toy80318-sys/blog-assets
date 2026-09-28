<?php
/**
 * Join (signup) + report moderation.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Accounts {

	public static function init() {
		add_action( 'admin_post_nopriv_utlc_join', array( __CLASS__, 'handle_join' ) );
		add_action( 'admin_post_utlc_join', array( __CLASS__, 'handle_join_logged_in' ) );
		add_action( 'wp_ajax_utlc_report', array( __CLASS__, 'ajax_report' ) );
	}

	private static function home() {
		return function_exists( 'utlc_community_url' ) ? utlc_community_url() : home_url( '/' );
	}

	private static function safe_redirect_to( $raw ) {
		$raw = (string) $raw;
		if ( '' === $raw ) {
			return '';
		}
		return wp_validate_redirect( esc_url_raw( $raw ), '' );
	}

	public static function render_join_form() {
		if ( is_user_logged_in() ) {
			echo '<div class="utlc-card utlc-alert utlc-alert--info">이미 로그인되어 있습니다. <a href="' . esc_url( self::home() ) . '">커뮤니티로 이동</a></div>';
			return;
		}
		if ( ! get_option( 'users_can_register' ) ) {
			echo '<div class="utlc-card utlc-alert utlc-alert--error">현재 회원가입이 닫혀 있습니다. 관리자에게 문의해 주세요.</div>';
			return;
		}
		$redirect = isset( $_GET['redirect_to'] ) ? self::safe_redirect_to( wp_unslash( $_GET['redirect_to'] ) ) : ''; // phpcs:ignore
		$login    = function_exists( 'utlc_login_url' ) ? utlc_login_url( $redirect ) : wp_login_url( $redirect );
		?>
		<div class="utlc-card utlc-join">
			<h1 class="utlc-join__title">회원가입</h1>
			<form class="utlc-join-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="utlc_join">
				<input type="hidden" name="redirect_to" value="<?php echo esc_attr( $redirect ); ?>">
				<?php wp_nonce_field( 'utlc_join', 'utlc_join_nonce' ); ?>
				<div style="position:absolute;left:-9999px;top:-9999px" aria-hidden="true">
					<label>비워 두세요 <input type="text" name="utlc_hp" value="" tabindex="-1" autocomplete="off"></label>
				</div>
				<div class="utlc-field">
					<label for="utlc_user_login">아이디 <span class="utlc-muted">(영문 소문자·숫자·밑줄 3~20자)</span></label>
					<input class="utlc-input" type="text" id="utlc_user_login" name="user_login" required pattern="[a-z0-9_]{3,20}" maxlength="20" autocomplete="username">
				</div>
				<div class="utlc-field">
					<label for="utlc_user_email">이메일</label>
					<input class="utlc-input" type="email" id="utlc_user_email" name="user_email" required autocomplete="email">
				</div>
				<div class="utlc-field">
					<label for="utlc_display_name">닉네임</label>
					<input class="utlc-input" type="text" id="utlc_display_name" name="display_name" maxlength="30" required>
				</div>
				<div class="utlc-field">
					<label for="utlc_pass1">비밀번호 <span class="utlc-muted">(8자 이상)</span></label>
					<input class="utlc-input" type="password" id="utlc_pass1" name="pass1" minlength="8" required autocomplete="new-password">
				</div>
				<div class="utlc-field">
					<label for="utlc_pass2">비밀번호 확인</label>
					<input class="utlc-input" type="password" id="utlc_pass2" name="pass2" minlength="8" required autocomplete="new-password">
				</div>
				<?php do_action( 'register_form' ); ?>
				<label class="utlc-check">
					<input type="checkbox" name="agree" value="1" required>
					이용약관 및 개인정보 수집·이용에 동의합니다.
				</label>
				<div class="utlc-join__actions">
					<button type="submit" class="utlc-btn utlc-btn--primary">가입하기</button>
				</div>
				<p class="utlc-muted">이미 계정이 있나요? <a href="<?php echo esc_url( $login ); ?>">로그인</a></p>
			</form>
		</div>
		<?php
	}

	public static function handle_join_logged_in() {
		wp_safe_redirect( self::home() );
		exit;
	}

	private static function join_fail( $msg, $redirect ) {
		if ( function_exists( 'utlc_flash' ) ) {
			utlc_flash( $msg, 'error' );
		}
		$url = function_exists( 'utlc_join_url' ) ? utlc_join_url() : home_url( '/join/' );
		if ( $redirect ) {
			$url = add_query_arg( 'redirect_to', rawurlencode( $redirect ), $url );
		}
		wp_safe_redirect( $url );
		exit;
	}

	public static function handle_join() {
		$redirect = isset( $_POST['redirect_to'] ) ? self::safe_redirect_to( wp_unslash( $_POST['redirect_to'] ) ) : ''; // phpcs:ignore
		if ( is_user_logged_in() ) {
			self::handle_join_logged_in();
		}
		if ( ! isset( $_POST['utlc_join_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['utlc_join_nonce'] ) ), 'utlc_join' ) ) {
			self::join_fail( '보안 토큰이 만료되었습니다. 다시 시도해 주세요.', $redirect );
		}
		if ( ! get_option( 'users_can_register' ) ) {
			self::join_fail( '현재 회원가입이 닫혀 있습니다.', $redirect );
		}
		if ( ! empty( $_POST['utlc_hp'] ) ) {
			self::join_fail( '요청을 처리할 수 없습니다.', $redirect );
		}
		$ip = function_exists( 'utlc_client_ip' ) ? utlc_client_ip() : '';
		if ( function_exists( 'utlc_rate_limited' ) && utlc_rate_limited( 'join_' . md5( $ip ), 5, HOUR_IN_SECONDS ) ) {
			self::join_fail( '가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', $redirect );
		}

		$login   = isset( $_POST['user_login'] ) ? strtolower( trim( sanitize_text_field( wp_unslash( $_POST['user_login'] ) ) ) ) : '';
		$email   = isset( $_POST['user_email'] ) ? trim( sanitize_email( wp_unslash( $_POST['user_email'] ) ) ) : '';
		$display = isset( $_POST['display_name'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['display_name'] ) ) ) : '';
		$pass1   = isset( $_POST['pass1'] ) ? (string) wp_unslash( $_POST['pass1'] ) : ''; // phpcs:ignore
		$pass2   = isset( $_POST['pass2'] ) ? (string) wp_unslash( $_POST['pass2'] ) : ''; // phpcs:ignore

		$errors = new WP_Error();
		if ( ! preg_match( '/^[a-z0-9_]{3,20}$/', $login ) || ! validate_username( $login ) ) {
			$errors->add( 'login', '아이디는 영문 소문자·숫자·밑줄 3~20자로 입력해 주세요.' );
		} elseif ( username_exists( $login ) ) {
			$errors->add( 'login_exists', '이미 사용 중인 아이디입니다.' );
		} else {
			$illegal = array_map( 'strtolower', (array) apply_filters( 'illegal_user_logins', array() ) );
			if ( in_array( $login, $illegal, true ) ) {
				$errors->add( 'login_illegal', '사용할 수 없는 아이디입니다.' );
			}
		}
		if ( ! $email || ! is_email( $email ) ) {
			$errors->add( 'email', '올바른 이메일 주소를 입력해 주세요.' );
		} elseif ( email_exists( $email ) ) {
			$errors->add( 'email_exists', '이미 가입된 이메일입니다.' );
		}
		$dlen = function_exists( 'mb_strlen' ) ? mb_strlen( $display, 'UTF-8' ) : strlen( $display );
		if ( '' === $display ) {
			$display = $login;
		} elseif ( $dlen > 30 ) {
			$errors->add( 'display', '닉네임은 30자 이하로 입력해 주세요.' );
		}
		if ( strlen( $pass1 ) < 8 ) {
			$errors->add( 'pass', '비밀번호는 8자 이상이어야 합니다.' );
		} elseif ( $pass1 !== $pass2 ) {
			$errors->add( 'pass2', '비밀번호 확인이 일치하지 않습니다.' );
		} elseif ( false !== strpos( $pass1, '\\' ) ) {
			$errors->add( 'pass3', '비밀번호에 역슬래시(\\)는 사용할 수 없습니다.' );
		}
		if ( empty( $_POST['agree'] ) ) {
			$errors->add( 'agree', '약관에 동의해 주세요.' );
		}

		do_action( 'register_post', $login, $email, $errors );
		$errors = apply_filters( 'registration_errors', $errors, $login, $email );
		if ( is_wp_error( $errors ) && $errors->has_errors() ) {
			self::join_fail( $errors->get_error_message(), $redirect );
		}

		$user_id = wp_insert_user(
			array(
				'user_login'   => $login,
				'user_email'   => $email,
				'user_pass'    => $pass1,
				'display_name' => $display,
				'nickname'     => $display,
				'role'         => get_option( 'default_role', 'subscriber' ),
			)
		);
		if ( is_wp_error( $user_id ) ) {
			self::join_fail( $user_id->get_error_message(), $redirect );
		}
		update_user_meta( $user_id, '_utlc_karma', 0 );
		if ( function_exists( 'wp_new_user_notification' ) ) {
			wp_new_user_notification( $user_id, null, 'admin' );
		}

		wp_set_current_user( $user_id );
		wp_set_auth_cookie( $user_id, true, is_ssl() );
		do_action( 'wp_login', $login, get_userdata( $user_id ) );

		if ( function_exists( 'utlc_flash' ) ) {
			utlc_flash( '가입을 환영합니다, ' . $display . '님!', 'success' );
		}
		wp_safe_redirect( $redirect ? $redirect : self::home() );
		exit;
	}

	/* ---------------- Report ---------------- */

	public static function ajax_report() {
		if ( function_exists( 'utlc_verify_ajax' ) ) {
			utlc_verify_ajax( true );
		} else {
			if ( ! check_ajax_referer( 'utlc_nonce', 'nonce', false ) || ! is_user_logged_in() ) {
				wp_send_json_error( array( 'message' => '로그인이 필요합니다.' ), 403 );
			}
		}
		global $wpdb;
		$uid     = get_current_user_id();
		$type    = isset( $_POST['object_type'] ) ? sanitize_key( wp_unslash( $_POST['object_type'] ) ) : '';
		$id      = isset( $_POST['object_id'] ) ? absint( $_POST['object_id'] ) : 0;
		$reason  = isset( $_POST['reason'] ) ? sanitize_text_field( wp_unslash( $_POST['reason'] ) ) : '';
		$details = isset( $_POST['details'] ) ? sanitize_textarea_field( wp_unslash( $_POST['details'] ) ) : '';
		$reason  = function_exists( 'mb_substr' ) ? mb_substr( $reason, 0, 50, 'UTF-8' ) : substr( $reason, 0, 50 );
		$details = function_exists( 'mb_substr' ) ? mb_substr( $details, 0, 1000, 'UTF-8' ) : substr( $details, 0, 1000 );
		if ( '' === $reason ) {
			$reason = '기타';
		}
		if ( ! in_array( $type, array( 'post', 'comment' ), true ) || ! $id ) {
			wp_send_json_error( array( 'message' => '잘못된 요청입니다.' ), 400 );
		}
		if ( 'post' === $type ) {
			$obj = get_post( $id );
			if ( ! $obj || ! in_array( $obj->post_type, array( 'utlc_post', 'post' ), true ) || 'publish' !== $obj->post_status ) {
				wp_send_json_error( array( 'message' => '대상을 찾을 수 없습니다.' ), 404 );
			}
		} else {
			$obj = get_comment( $id );
			if ( ! $obj || '1' !== (string) $obj->comment_approved ) {
				wp_send_json_error( array( 'message' => '대상을 찾을 수 없습니다.' ), 404 );
			}
		}
		if ( function_exists( 'utlc_rate_limited' ) && utlc_rate_limited( 'report_' . $uid, 30, HOUR_IN_SECONDS ) ) {
			wp_send_json_error( array( 'message' => '신고를 너무 자주 했습니다. 잠시 후 다시 시도해 주세요.' ), 429 );
		}

		$table = $wpdb->prefix . 'utlc_reports';
		$now   = current_time( 'mysql', true );
		$ok    = $wpdb->query( // phpcs:ignore
			$wpdb->prepare(
				"INSERT IGNORE INTO {$table} (object_type, object_id, reporter_id, reason, details, status, created_at) VALUES (%s, %d, %d, %s, %s, 'open', %s)", // phpcs:ignore
				$type,
				$id,
				$uid,
				$reason,
				$details,
				$now
			)
		);
		if ( false === $ok ) {
			wp_send_json_error( array( 'message' => '신고를 저장하지 못했습니다.' ), 500 );
		}
		if ( 0 === (int) $ok ) {
			wp_send_json_error( array( 'message' => '이미 신고한 항목입니다.' ), 409 );
		}

		$count = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE object_type = %s AND object_id = %d AND status = 'open'", $type, $id ) ); // phpcs:ignore
		$threshold = function_exists( 'utlc_opt' ) ? (int) utlc_opt( 'report_threshold' ) : 5;
		$hidden    = false;
		if ( 'post' === $type ) {
			update_post_meta( $id, '_utlc_report_count', $count );
			// Never touch legacy blog posts (post type 'post'); only hide community posts.
			if ( $threshold > 0 && $count >= $threshold && 'utlc_post' === $obj->post_type ) {
				$had_kses = false !== has_filter( 'content_save_pre', 'wp_filter_post_kses' );
				kses_remove_filters();
				wp_update_post( array( 'ID' => $id, 'post_status' => 'pending' ) );
				if ( $had_kses ) {
					kses_init_filters();
				}
				$hidden = true;
			}
		} else {
			update_comment_meta( $id, '_utlc_report_count', $count );
			if ( $threshold > 0 && $count >= $threshold ) {
				wp_set_comment_status( $id, 'hold' );
				$hidden = true;
			}
		}
		do_action( 'utlc_reported', $type, $id, $uid, $count, $hidden );
		wp_send_json_success(
			array(
				'message' => '신고가 접수되었습니다. 검토 후 조치하겠습니다.',
				'count'   => $count,
				'hidden'  => $hidden,
			)
		);
	}
}
