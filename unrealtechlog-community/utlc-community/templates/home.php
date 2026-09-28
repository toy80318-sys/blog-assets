<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view     = isset( $view ) ? $view : UTLC_Router::view();
$base_url = UTLC_Router::community_url();
$feed     = array( 'posts' => array(), 'total' => 0, 'pages' => 0 );
if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'feed' ) ) {
	$feed = UTLC_Core::feed(
		array(
			'sort'     => $view['sort'],
			't'        => $view['t'],
			'page'     => $view['pg'],
			'per_page' => (int) UTLC_Router::opt( 'posts_per_page', 20 ),
			'search'   => $view['q'],
		)
	);
}
$ids   = wp_list_pluck( $feed['posts'], 'ID' );
$votes = ( is_user_logged_in() && $ids && method_exists( 'UTLC_Core', 'user_votes' ) ) ? UTLC_Core::user_votes( get_current_user_id(), 'post', $ids ) : array();
?>
<div class="utlc-page">
	<div class="utlc-content">
		<?php UTLC_Router::render( 'parts/sort-bar', array( 'view' => $view, 'base_url' => $base_url ) ); ?>
		<div class="utlc-feed">
			<?php if ( $feed['posts'] ) : ?>
				<?php foreach ( $feed['posts'] as $p ) : ?>
					<?php UTLC_Router::render( 'parts/post-card', array( 'post' => $p, 'user_vote' => isset( $votes[ $p->ID ] ) ? (int) $votes[ $p->ID ] : 0, 'show_board' => true ) ); ?>
				<?php endforeach; ?>
			<?php else : ?>
				<div class="utlc-card utlc-empty">
					<p><?php echo esc_html( '' !== $view['q'] ? '검색 결과가 없습니다.' : '아직 게시글이 없습니다. 첫 글을 작성해 보세요!' ); ?></p>
					<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( function_exists( 'utlc_submit_url' ) ? utlc_submit_url() : home_url( '/submit/' ) ); ?>">글쓰기</a>
				</div>
			<?php endif; ?>
		</div>
		<?php UTLC_Router::render( 'parts/pagination', array( 'pages' => (int) $feed['pages'], 'pg' => $view['pg'], 'base_url' => $base_url ) ); ?>
	</div>
	<aside class="utlc-sidebar">
		<?php UTLC_Router::render( 'parts/sidebar-home', array( 'view' => $view ) ); ?>
	</aside>
</div>
