<?php
/**
 * Plugin Name:       UTLC 커뮤니티 (언리얼테크로그)
 * Plugin URI:        https://unrealtechlog.com/
 * Description:       레딧 스타일 커뮤니티(게시판·투표·댓글) + 3D 모델 마켓. 기존 블로그 글은 그대로 유지하면서 게시판에 연결합니다.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            언리얼테크로그
 * License:           GPL-2.0-or-later
 * Text Domain:       utlc-community
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'UTLC_VERSION', '1.0.0' );
define( 'UTLC_DB_VERSION', '1' );
define( 'UTLC_FILE', __FILE__ );
define( 'UTLC_DIR', plugin_dir_path( __FILE__ ) );
define( 'UTLC_URL', plugin_dir_url( __FILE__ ) );

/**
 * Load plugin files (each guarded so a missing module never fatals).
 */
function utlc_load_files() {
	$files = array(
		'includes/helpers.php',
		'includes/class-utlc-install.php',
		'includes/class-utlc-core.php',
		'includes/class-utlc-router.php',
		'includes/class-utlc-content.php',
		'includes/class-utlc-submit.php',
		'includes/class-utlc-comments.php',
		'includes/class-utlc-accounts.php',
		'includes/class-utlc-market.php',
		'includes/class-utlc-orders.php',
	);
	if ( is_admin() ) {
		$files[] = 'includes/admin/class-utlc-admin.php';
	}
	foreach ( $files as $file ) {
		$path = UTLC_DIR . $file;
		if ( file_exists( $path ) ) {
			require_once $path;
		}
	}
}
utlc_load_files();

/**
 * Activation.
 */
function utlc_activate( $network_wide = false ) {
	if ( class_exists( 'UTLC_Install' ) && method_exists( 'UTLC_Install', 'activate' ) ) {
		UTLC_Install::activate();
	}
}
register_activation_hook( __FILE__, 'utlc_activate' );

/**
 * Deactivation.
 */
function utlc_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'utlc_deactivate' );

/**
 * Boot every module.
 */
function utlc_boot() {
	$classes = array(
		'UTLC_Core',
		'UTLC_Router',
		'UTLC_Content',
		'UTLC_Submit',
		'UTLC_Comments',
		'UTLC_Accounts',
		'UTLC_Market',
		'UTLC_Orders',
		'UTLC_Admin',
	);
	foreach ( $classes as $class ) {
		if ( class_exists( $class ) && method_exists( $class, 'init' ) ) {
			call_user_func( array( $class, 'init' ) );
		}
	}
}
add_action( 'plugins_loaded', 'utlc_boot' );

if ( class_exists( 'UTLC_Install' ) ) {
	add_action( 'init', array( 'UTLC_Install', 'maybe_upgrade' ), 20 );
}
