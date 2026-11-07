<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view   = isset( $view ) ? $view : UTLC_Router::view();
$home   = UTLC_Router::community_url();
$boards = ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'boards' ) ) ? UTLC_Core::boards() : array();
$cur_id = ( $view['board'] && isset( $view['board']->term_id ) ) ? (int) $view['board']->term_id : 0;
$is_home = 'home' === $view['route'];
?>
<nav class="utlc-nav">
	<a class="utlc-nav__item<?php echo ( $is_home && 'hot' === $view['sort'] ) ? ' is-active' : ''; ?>" href="<?php echo esc_url( $home ); ?>"><span class="utlc-nav__icon">🏠</span>홈</a>
	<a class="utlc-nav__item<?php echo ( $is_home && 'top' === $view['sort'] ) ? ' is-active' : ''; ?>" href="<?php echo esc_url( add_query_arg( array( 'sort' => 'top', 't' => 'week' ), $home ) ); ?>"><span class="utlc-nav__icon">🔥</span>인기</a>
	<a class="utlc-nav__item<?php echo ( $is_home && 'new' === $view['sort'] ) ? ' is-active' : ''; ?>" href="<?php echo esc_url( add_query_arg( 'sort', 'new', $home ) ); ?>"><span class="utlc-nav__icon">🆕</span>최신</a>
	<a class="utlc-nav__item<?php echo 'communities' === $view['route'] ? ' is-active' : ''; ?>" href="<?php echo esc_url( home_url( '/communities/' ) ); ?>"><span class="utlc-nav__icon">🧭</span>게시판 목록</a>

	<?php if ( $boards ) : ?>
		<div class="utlc-nav__heading">게시판</div>
		<?php foreach ( $boards as $b ) :
			$icon = method_exists( 'UTLC_Core', 'board_meta' ) ? UTLC_Core::board_meta( $b, 'utlc_icon' ) : '';
			$url  = function_exists( 'utlc_board_url' ) ? utlc_board_url( $b ) : get_term_link( $b );
			if ( is_wp_error( $url ) ) {
				continue;
			}
			?>
			<a class="utlc-nav__item<?php echo $cur_id === (int) $b->term_id ? ' is-active' : ''; ?>" href="<?php echo esc_url( $url ); ?>">
				<span class="utlc-nav__icon"><?php echo esc_html( $icon ? $icon : '#' ); ?></span>
				<span class="utlc-nav__label">r/<?php echo esc_html( $b->slug ); ?></span>
			</a>
		<?php endforeach; ?>
	<?php endif; ?>

	<div class="utlc-nav__heading">바로가기</div>
	<a class="utlc-nav__item" href="<?php echo esc_url( home_url( '/' ) ); ?>"><span class="utlc-nav__icon">📘</span><?php echo esc_html( get_bloginfo( 'name' ) ); ?></a>
	<?php if ( is_user_logged_in() ) : ?>
		<a class="utlc-nav__item" href="<?php echo esc_url( function_exists( 'utlc_user_url' ) ? utlc_user_url( get_current_user_id() ) : home_url( '/' ) ); ?>"><span class="utlc-nav__icon">👤</span>내 프로필</a>
	<?php endif; ?>
</nav>
