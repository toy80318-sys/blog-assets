<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view = isset( $view ) ? $view : UTLC_Router::view();
$user = $view['user'];
if ( ! $user ) {
	UTLC_Router::render( 'notfound', array( 'view' => $view ) );
	return;
}
$is_self  = is_user_logged_in() && get_current_user_id() === (int) $user->ID;
$karma    = (int) get_user_meta( $user->ID, '_utlc_karma', true );
$base_url = function_exists( 'utlc_user_url' ) ? utlc_user_url( $user ) : home_url( '/u/' . $user->user_nicename . '/' );
$tabs     = array(
	'posts'    => '게시글',
	'comments' => '댓글',
	'listings' => '판매 모델',
);
if ( $is_self ) {
	$tabs['purchases'] = '구매 내역';
	$tabs['sales']     = '판매 관리';
}
$tab = $view['tab'];
?>
<div class="utlc-page">
	<div class="utlc-content">
		<div class="utlc-card utlc-profile-head">
			<?php echo function_exists( 'utlc_avatar' ) ? utlc_avatar( $user->ID, 72 ) : ''; // phpcs:ignore ?>
			<div class="utlc-profile-head__info">
				<h1><?php echo esc_html( $user->display_name ); ?></h1>
				<div class="utlc-muted">u/<?php echo esc_html( $user->user_nicename ); ?></div>
				<?php if ( function_exists( 'utlc_is_banned' ) && utlc_is_banned( $user->ID ) ) : ?>
					<span class="utlc-badge utlc-badge--danger">이용 제한</span>
				<?php endif; ?>
			</div>
			<div class="utlc-profile-head__stats">
				<div class="utlc-stat"><strong><?php echo esc_html( number_format_i18n( $karma ) ); ?></strong><span>카르마</span></div>
				<div class="utlc-stat"><strong><?php echo esc_html( mysql2date( 'Y.m.d', $user->user_registered ) ); ?></strong><span>가입일</span></div>
			</div>
		</div>

		<nav class="utlc-tabs">
			<?php foreach ( $tabs as $key => $label ) : ?>
				<a class="utlc-tab<?php echo $key === $tab ? ' is-active' : ''; ?>" href="<?php echo esc_url( 'posts' === $key ? $base_url : add_query_arg( 'tab', $key, $base_url ) ); ?>"><?php echo esc_html( $label ); ?></a>
			<?php endforeach; ?>
		</nav>

		<div class="utlc-profile-body">
			<?php
			if ( 'posts' === $tab ) {
				$feed = array( 'posts' => array(), 'pages' => 0 );
				if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'feed' ) ) {
					$feed = UTLC_Core::feed(
						array(
							'author_id' => (int) $user->ID,
							'sort'      => 'new',
							'page'      => $view['pg'],
							'per_page'  => (int) UTLC_Router::opt( 'posts_per_page', 20 ),
						)
					);
				}
				$ids   = wp_list_pluck( $feed['posts'], 'ID' );
				$votes = ( is_user_logged_in() && $ids && method_exists( 'UTLC_Core', 'user_votes' ) ) ? UTLC_Core::user_votes( get_current_user_id(), 'post', $ids ) : array();
				if ( $feed['posts'] ) {
					echo '<div class="utlc-feed">';
					foreach ( $feed['posts'] as $p ) {
						UTLC_Router::render( 'parts/post-card', array( 'post' => $p, 'user_vote' => isset( $votes[ $p->ID ] ) ? (int) $votes[ $p->ID ] : 0, 'show_board' => true ) );
					}
					echo '</div>';
					UTLC_Router::render( 'parts/pagination', array( 'pages' => (int) $feed['pages'], 'pg' => $view['pg'], 'base_url' => $base_url ) );
				} else {
					echo '<div class="utlc-card utlc-empty"><p>' . esc_html( '작성한 게시글이 없습니다.' ) . '</p></div>';
				}
			} elseif ( 'comments' === $tab ) {
				echo '<div class="utlc-card utlc-card--pad">';
				if ( class_exists( 'UTLC_Comments' ) && method_exists( 'UTLC_Comments', 'render_user_comments' ) ) {
					echo UTLC_Comments::render_user_comments( $user ); // phpcs:ignore -- escaped by C
				}
				echo '</div>';
			} else {
				echo '<div class="utlc-card utlc-card--pad">';
				if ( class_exists( 'UTLC_Market' ) && method_exists( 'UTLC_Market', 'render_profile_tab' ) ) {
					echo UTLC_Market::render_profile_tab( $tab, $user ); // phpcs:ignore -- escaped by D
				} else {
					echo '<p class="utlc-muted">' . esc_html( '표시할 내용이 없습니다.' ) . '</p>';
				}
				echo '</div>';
			}
			?>
		</div>
	</div>
	<aside class="utlc-sidebar">
		<div class="utlc-card utlc-side-card">
			<div class="utlc-side-card__head">u/<?php echo esc_html( $user->user_nicename ); ?></div>
			<div class="utlc-side-card__body">
				<?php if ( '' !== trim( (string) $user->description ) ) : ?>
					<p><?php echo esc_html( $user->description ); ?></p>
				<?php endif; ?>
				<div class="utlc-stats-row">
					<div class="utlc-stat"><strong><?php echo esc_html( number_format_i18n( $karma ) ); ?></strong><span>카르마</span></div>
					<div class="utlc-stat"><strong><?php echo esc_html( mysql2date( 'Y.m.d', $user->user_registered ) ); ?></strong><span>가입일</span></div>
				</div>
				<?php if ( $is_self ) : ?>
					<div class="utlc-side-card__actions">
						<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="<?php echo esc_url( admin_url( 'profile.php' ) ); ?>">프로필 설정</a>
					</div>
				<?php endif; ?>
			</div>
		</div>
	</aside>
</div>
