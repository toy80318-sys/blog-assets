<?php
/**
 * Shared helper functions.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function utlc_default_settings() {
	return array(
		'community_name'        => '언리얼테크로그 커뮤니티',
		'front_page'            => 1,
		'legacy_board'          => 'techlog',
		'category_map'          => array(),
		'legacy_vote_bar'       => 1,
		'posts_per_page'        => 20,
		'post_rate_per_hour'    => 10,
		'comment_rate_per_hour' => 60,
		'image_max_mb'          => 10,
		'images_per_post'       => 10,
		'market_review'         => 1,
		'commission_rate'       => 20,
		'model_max_mb'          => 200,
		'model_extensions'      => 'zip,7z,rar,fbx,obj,glb,gltf,blend,uasset,umap,usd,usdz,stl,abc,ma,mb,max,c4d,3ds,dae,ply,spp,sbsar',
		'min_price'             => 1000,
		'max_price'             => 5000000,
		'gateway_bank'          => 1,
		'bank_name'             => '',
		'bank_account'          => '',
		'bank_holder'           => '',
		'gateway_toss'          => 0,
		'toss_client_key'       => '',
		'toss_secret_key'       => '',
		'min_payout'            => 10000,
		'market_notice'         => '언리얼테크로그는 통신판매중개자이며 통신판매의 당사자가 아닙니다. 상품 정보 및 거래에 대한 책임은 판매자에게 있습니다.',
		'refund_notice'         => '디지털 콘텐츠 특성상 다운로드 후에는 청약철회가 제한됩니다(전자상거래법 제17조 제2항 제5호).',
		'report_threshold'      => 5,
	);
}

function utlc_settings() {
	$saved = get_option( 'utlc_settings', array() );
	if ( ! is_array( $saved ) ) {
		$saved = array();
	}
	return array_merge( utlc_default_settings(), $saved );
}

function utlc_opt( $key ) {
	$s = utlc_settings();
	return isset( $s[ $key ] ) ? $s[ $key ] : null;
}

function utlc_time_ago( $gmt_mysql ) {
	if ( empty( $gmt_mysql ) || '0000-00-00 00:00:00' === $gmt_mysql ) {
		return '';
	}
	$ts = strtotime( $gmt_mysql . ' UTC' );
	if ( ! $ts ) {
		return '';
	}
	$diff = time() - $ts;
	if ( $diff < 60 ) {
		return '방금 전';
	}
	if ( $diff < 3600 ) {
		return floor( $diff / 60 ) . '분 전';
	}
	if ( $diff < 86400 ) {
		return floor( $diff / 3600 ) . '시간 전';
	}
	if ( $diff < 86400 * 30 ) {
		return floor( $diff / 86400 ) . '일 전';
	}
	if ( $diff < 86400 * 365 ) {
		return floor( $diff / ( 86400 * 30 ) ) . '개월 전';
	}
	return floor( $diff / ( 86400 * 365 ) ) . '년 전';
}

function utlc_krw( $int ) {
	$int = (int) $int;
	if ( $int <= 0 ) {
		return '무료';
	}
	return number_format( $int ) . '원';
}

function utlc_community_url() {
	if ( utlc_opt( 'front_page' ) ) {
		return home_url( '/' );
	}
	return home_url( '/community/' );
}

function utlc_board_url( $term ) {
	if ( ! is_object( $term ) ) {
		$term = class_exists( 'UTLC_Core' ) ? UTLC_Core::board( $term ) : get_term( $term, 'utlc_board' );
	}
	if ( ! $term || is_wp_error( $term ) ) {
		return utlc_community_url();
	}
	return home_url( '/r/' . rawurlencode( $term->slug ) . '/' );
}

function utlc_post_url( $post ) {
	$url = get_permalink( $post );
	return $url ? $url : utlc_community_url();
}

function utlc_user_url( $user_or_id ) {
	$user = is_object( $user_or_id ) ? $user_or_id : get_userdata( (int) $user_or_id );
	if ( ! $user ) {
		return utlc_community_url();
	}
	return home_url( '/u/' . rawurlencode( $user->user_nicename ) . '/' );
}

function utlc_submit_url( $term = null ) {
	if ( $term ) {
		if ( ! is_object( $term ) && class_exists( 'UTLC_Core' ) ) {
			$term = UTLC_Core::board( $term );
		}
		if ( $term && ! is_wp_error( $term ) && isset( $term->slug ) ) {
			return home_url( '/r/' . rawurlencode( $term->slug ) . '/submit/' );
		}
	}
	return home_url( '/submit/' );
}

function utlc_login_url( $redirect = '' ) {
	$url = home_url( '/login/' );
	if ( $redirect ) {
		$url = add_query_arg( 'redirect_to', rawurlencode( $redirect ), $url );
	}
	return $url;
}

function utlc_join_url() {
	return home_url( '/join/' );
}

function utlc_avatar( $user_id, $size = 32 ) {
	$user = get_userdata( (int) $user_id );
	$name = $user ? ( $user->display_name ? $user->display_name : $user->user_login ) : '?';
	if ( function_exists( 'mb_substr' ) ) {
		$letter = mb_strtoupper( mb_substr( $name, 0, 1, 'UTF-8' ), 'UTF-8' );
	} else {
		$letter = strtoupper( substr( $name, 0, 1 ) );
	}
	$hue  = abs( crc32( (string) ( $user ? $user->ID : 0 ) . $name ) ) % 360;
	$size = (int) $size;
	return '<span class="utlc-avatar" style="--s:' . $size . 'px;--h:' . $hue . '" aria-hidden="true">' . esc_html( $letter ) . '</span>';
}

function utlc_is_banned( $user_id ) {
	if ( ! $user_id ) {
		return false;
	}
	return (bool) get_user_meta( (int) $user_id, '_utlc_banned', true );
}

function utlc_rate_limited( $key, $max, $window_sec ) {
	$max = (int) $max;
	if ( $max <= 0 ) {
		return false;
	}
	$tkey  = 'utlc_rl_' . md5( $key );
	$count = (int) get_transient( $tkey );
	$count++;
	set_transient( $tkey, $count, (int) $window_sec );
	return $count > $max;
}

function utlc_verify_ajax( $require_login = true ) {
	if ( ! check_ajax_referer( 'utlc_nonce', 'nonce', false ) ) {
		wp_send_json_error( array( 'message' => '보안 토큰이 만료되었습니다. 페이지를 새로고침해 주세요.' ), 403 );
	}
	if ( $require_login && ! is_user_logged_in() ) {
		wp_send_json_error( array( 'message' => '로그인이 필요합니다.', 'login' => true ), 401 );
	}
	if ( is_user_logged_in() && utlc_is_banned( get_current_user_id() ) ) {
		wp_send_json_error( array( 'message' => '이용이 제한된 계정입니다.' ), 403 );
	}
	return true;
}

function utlc_get_template_part( $slug, $args = array() ) {
	$slug = ltrim( (string) $slug, '/' );
	$file = locate_template( array( 'utlc-community/' . $slug . '.php' ) );
	if ( ! $file ) {
		$file = UTLC_DIR . 'templates/' . $slug . '.php';
	}
	if ( ! file_exists( $file ) ) {
		return false;
	}
	if ( is_array( $args ) ) {
		extract( $args, EXTR_SKIP ); // phpcs:ignore WordPress.PHP.DontExtract
	}
	include $file;
	return true;
}

function utlc_flash( $msg, $type = 'success' ) {
	$data = wp_json_encode( array( 'msg' => (string) $msg, 'type' => (string) $type ) );
	$_COOKIE['utlc_flash'] = $data;
	if ( ! headers_sent() ) {
		setcookie( 'utlc_flash', $data, time() + 60, COOKIEPATH ? COOKIEPATH : '/', COOKIE_DOMAIN, is_ssl(), true );
	}
}

function utlc_flash_get() {
	// Read once per request (primed on template_redirect, before any output) so the cookie can be cleared.
	static $cached = false;
	if ( false !== $cached ) {
		return $cached;
	}
	$cached = null;
	if ( empty( $_COOKIE['utlc_flash'] ) ) {
		return null;
	}
	$raw  = wp_unslash( $_COOKIE['utlc_flash'] ); // phpcs:ignore
	$data = json_decode( $raw, true );
	unset( $_COOKIE['utlc_flash'] );
	if ( ! headers_sent() ) {
		setcookie( 'utlc_flash', '', time() - 3600, COOKIEPATH ? COOKIEPATH : '/', COOKIE_DOMAIN, is_ssl(), true );
	}
	if ( ! is_array( $data ) || empty( $data['msg'] ) ) {
		return null;
	}
	$cached = array(
		'msg'  => sanitize_text_field( $data['msg'] ),
		'type' => in_array( isset( $data['type'] ) ? $data['type'] : '', array( 'success', 'error', 'info' ), true ) ? $data['type'] : 'info',
	);
	return $cached;
}
add_action( 'template_redirect', 'utlc_flash_get', 0 );

function utlc_client_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$ip = filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : '0.0.0.0';
	return $ip;
}
