<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$flash = UTLC_Router::flash();
if ( ! $flash || ! is_array( $flash ) ) {
	return;
}
$msg = '';
if ( isset( $flash['msg'] ) ) {
	$msg = $flash['msg'];
} elseif ( isset( $flash['message'] ) ) {
	$msg = $flash['message'];
} elseif ( isset( $flash[0] ) ) {
	$msg = $flash[0];
}
$type = isset( $flash['type'] ) ? $flash['type'] : ( isset( $flash[1] ) ? $flash[1] : 'success' );
$type = in_array( $type, array( 'success', 'error', 'info' ), true ) ? $type : 'info';
if ( '' === (string) $msg ) {
	return;
}
?>
<div class="utlc-alert utlc-alert--<?php echo esc_attr( $type ); ?> utlc-flash" role="status"><?php echo esc_html( $msg ); ?></div>
