<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view     = isset( $view ) ? $view : UTLC_Router::view();
$board    = $view['board'];
if ( ! $board ) {
	UTLC_Router::render( 'notfound', array( 'view' => $view ) );
	return;
}
$base_url = function_exists( 'utlc_board_url' ) ? utlc_board_url( $board ) : get_term_link( $board );
$has_core = class_exists( 'UTLC_Core' );
$feed     = array( 'posts' => array(), 'total' => 0, 'pages' => 0 );
if ( $has_core && method_exists( 'UTLC_Core', 'feed' ) ) {
	$feed = UTLC_Core::feed(
		array(
			'board_id' => (int) $board->term_id,
			'sort'     => $view['sort'],
			't'        => $view['t'],
			'page'     => $view['pg'],
			'per_page' => (int) UTLC_Router::opt( 'posts_per_page', 20 ),
			'search'   => $view['q'],
		)
	);
}
$pinned = array();
if ( 1 === (int) $view['pg'] && '' === $view['q'] && $has_core && method_exists( 'UTLC_Core', 'pinned' ) ) {
	$pinned = UTLC_Core::pinned( (int) $board->term_id );
}
$pinned_ids = wp_list_pluck( $pinned, 'ID' );
$posts      = array();
foreach ( $feed['posts'] as $p ) {
	if ( ! in_array( $p->ID, $pinned_ids, true ) ) {
		$posts[] = $p;
	}
}
$ids   = array_merge( $pinned_ids, wp_list_pluck( $posts, 'ID' ) );
$votes = ( is_user_logged_in() && $ids && method_exists( 'UTLC_Core', 'user_votes' ) ) ? UTLC_Core::user_votes( get_current_user_id(), 'post', $ids ) : array();
?>
<?php UTLC_Router::render( 'parts/board-header', array( 'board' => $board ) ); ?>
<div class="utlc-page">
	<div class="utlc-content">
		<?php UTLC_Router::render( 'parts/sort-bar', array( 'view' => $view, 'base_url' => $base_url ) ); ?>
		<div class="utlc-feed">
			<?php foreach ( array_merge( $pinned, $posts ) as $p ) : ?>
				<?php UTLC_Router::render( 'parts/post-card', array( 'post' => $p, 'user_vote' => isset( $votes[ $p->ID ] ) ? (int) $votes[ $p->ID ] : 0, 'show_board' => false ) ); ?>
			<?php endforeach; ?>
			<?php if ( ! $pinned && ! $posts ) : ?>
				<div class="utlc-card utlc-empty">
					<p><?php echo esc_html( '' !== $view['q'] ? '검색 결과가 없습니다.' : '아직 게시글이 없습니다.' ); ?></p>
				</div>
			<?php endif; ?>
		</div>
		<?php UTLC_Router::render( 'parts/pagination', array( 'pages' => (int) $feed['pages'], 'pg' => $view['pg'], 'base_url' => $base_url ) ); ?>
	</div>
	<aside class="utlc-sidebar">
		<?php UTLC_Router::render( 'parts/sidebar-board', array( 'board' => $board ) ); ?>
	</aside>
</div>
