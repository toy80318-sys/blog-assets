<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view        = isset( $view ) ? $view : UTLC_Router::view();
$home        = UTLC_Router::community_url();
$search_base = ( 'board' === $view['route'] && $view['board'] && function_exists( 'utlc_board_url' ) ) ? utlc_board_url( $view['board'] ) : $home;
$submit_url  = function_exists( 'utlc_submit_url' ) ? utlc_submit_url( in_array( $view['route'], array( 'board', 'single' ), true ) ? $view['board'] : null ) : home_url( '/submit/' );
$me          = wp_get_current_user();
?>
<header class="utlc-topbar">
	<button type="button" class="utlc-topbar__menu" data-utlc-drawer-toggle aria-label="<?php echo esc_attr( '메뉴 열기' ); ?>">
		<span></span><span></span><span></span>
	</button>
	<a class="utlc-topbar__logo" href="<?php echo esc_url( $home ); ?>">
		<span class="utlc-topbar__mark">U</span>
		<span class="utlc-topbar__name"><?php echo esc_html( UTLC_Router::opt( 'community_name', '커뮤니티' ) ); ?></span>
	</a>
	<form class="utlc-topbar__search" method="get" action="<?php echo esc_url( $search_base ); ?>" role="search">
		<input type="search" name="q" class="utlc-input" value="<?php echo esc_attr( $view['q'] ); ?>" placeholder="<?php echo esc_attr( ( 'board' === $view['route'] && $view['board'] ) ? 'r/' . $view['board']->slug . ' 에서 검색' : '커뮤니티 검색' ); ?>">
	</form>
	<div class="utlc-topbar__actions">
		<a class="utlc-btn utlc-btn--ghost utlc-btn--sm utlc-topbar__write" href="<?php echo esc_url( $submit_url ); ?>">✏️ <span>글쓰기</span></a>
		<?php if ( is_user_logged_in() ) : ?>
			<div class="utlc-dropdown">
				<button type="button" class="utlc-topbar__user" data-utlc-dropdown aria-haspopup="true">
					<?php echo function_exists( 'utlc_avatar' ) ? utlc_avatar( $me->ID, 30 ) : ''; // phpcs:ignore -- helper returns escaped markup ?>
					<span class="utlc-topbar__username"><?php echo esc_html( $me->display_name ); ?></span>
				</button>
				<div class="utlc-dropdown__menu" role="menu">
					<?php $profile = function_exists( 'utlc_user_url' ) ? utlc_user_url( $me ) : home_url( '/u/' . $me->user_nicename . '/' ); ?>
					<a href="<?php echo esc_url( $profile ); ?>">내 프로필</a>
					<a href="<?php echo esc_url( add_query_arg( 'tab', 'purchases', $profile ) ); ?>">구매 내역</a>
					<a href="<?php echo esc_url( add_query_arg( 'tab', 'sales', $profile ) ); ?>">판매 관리</a>
					<?php if ( current_user_can( 'edit_posts' ) ) : ?>
						<a href="<?php echo esc_url( admin_url() ); ?>">관리자</a>
					<?php endif; ?>
					<a href="<?php echo esc_url( wp_logout_url( $home ) ); ?>">로그아웃</a>
				</div>
			</div>
		<?php else : ?>
			<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="<?php echo esc_url( UTLC_Router::login_url( UTLC_Router::current_url() ) ); ?>">로그인</a>
			<a class="utlc-btn utlc-btn--primary utlc-btn--sm" href="<?php echo esc_url( function_exists( 'utlc_join_url' ) ? utlc_join_url() : home_url( '/join/' ) ); ?>">회원가입</a>
		<?php endif; ?>
	</div>
</header>
