<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view = UTLC_Router::view();
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<div class="utlc-app" id="utlc-app">
	<?php UTLC_Router::render( 'parts/topbar', array( 'view' => $view ) ); ?>
	<div class="utlc-shell">
		<aside class="utlc-leftnav" id="utlc-leftnav" aria-label="<?php echo esc_attr( '커뮤니티 메뉴' ); ?>">
			<?php UTLC_Router::render( 'parts/left-nav', array( 'view' => $view ) ); ?>
		</aside>
		<div class="utlc-drawer-backdrop" data-utlc-drawer-close></div>
		<main class="utlc-main" id="utlc-main">
			<?php UTLC_Router::render( 'parts/flash', array( 'view' => $view ) ); ?>
			<?php UTLC_Router::render( $view['template'], array( 'view' => $view ) ); ?>
		</main>
	</div>
</div>
<?php wp_footer(); ?>
</body>
</html>
