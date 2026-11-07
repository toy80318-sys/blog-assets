<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view = isset( $view ) ? $view : UTLC_Router::view();
$post = $view['post'] ? get_post( $view['post'] ) : null;
if ( ! $post ) {
	UTLC_Router::render( 'notfound', array( 'view' => $view ) );
	return;
}
$GLOBALS['post'] = $post; // phpcs:ignore
setup_postdata( $post );

$board     = $view['board'];
$has_core  = class_exists( 'UTLC_Core' );
$kind      = get_post_meta( $post->ID, '_utlc_kind', true );
$kind      = $kind ? $kind : 'text';
$score     = (int) get_post_meta( $post->ID, '_utlc_score', true );
$flair     = (string) get_post_meta( $post->ID, '_utlc_flair', true );
$link      = (string) get_post_meta( $post->ID, '_utlc_url', true );
$images    = get_post_meta( $post->ID, '_utlc_images', true );
$edited    = (string) get_post_meta( $post->ID, '_utlc_edited', true );
$author    = get_userdata( $post->post_author );
$uid       = get_current_user_id();
$user_vote = 0;
if ( $uid && $has_core && method_exists( 'UTLC_Core', 'user_votes' ) ) {
	$uv        = UTLC_Core::user_votes( $uid, 'post', array( $post->ID ) );
	$user_vote = isset( $uv[ $post->ID ] ) ? (int) $uv[ $post->ID ] : 0;
}
$can_manage = UTLC_Router::can_manage_post( $post );
$icon       = ( $board && $has_core ) ? UTLC_Core::board_meta( $board, 'utlc_icon' ) : '';
$permalink  = get_permalink( $post );
$yt         = ( '' !== $link && class_exists( 'UTLC_Content' ) && method_exists( 'UTLC_Content', 'youtube_id' ) ) ? UTLC_Content::youtube_id( $link ) : '';
?>
<div class="utlc-page">
	<div class="utlc-content">
		<article class="utlc-card utlc-single">
			<div class="utlc-single__meta utlc-muted">
				<?php if ( $board ) : ?>
					<a class="utlc-post-card__board" href="<?php echo esc_url( function_exists( 'utlc_board_url' ) ? utlc_board_url( $board ) : get_term_link( $board ) ); ?>"><span class="utlc-board-icon"><?php echo esc_html( $icon ? $icon : '#' ); ?></span>r/<?php echo esc_html( $board->slug ); ?></a>
					<span aria-hidden="true">·</span>
				<?php endif; ?>
				<?php if ( $author ) : ?>
					<?php echo function_exists( 'utlc_avatar' ) ? utlc_avatar( $author->ID, 20 ) : ''; // phpcs:ignore ?>
					<a href="<?php echo esc_url( function_exists( 'utlc_user_url' ) ? utlc_user_url( $author ) : '#' ); ?>">u/<?php echo esc_html( $author->user_nicename ); ?></a>
					<span aria-hidden="true">·</span>
				<?php endif; ?>
				<time datetime="<?php echo esc_attr( mysql2date( 'c', $post->post_date_gmt, false ) ); ?>"><?php echo esc_html( function_exists( 'utlc_time_ago' ) ? utlc_time_ago( $post->post_date_gmt ) : get_the_date( '', $post ) ); ?></time>
				<?php if ( '' !== $edited ) : ?><span class="utlc-muted">(수정됨)</span><?php endif; ?>
				<?php if ( '1' === (string) get_post_meta( $post->ID, '_utlc_pinned', true ) ) : ?><span class="utlc-badge utlc-badge--pin">📌 고정</span><?php endif; ?>
				<?php if ( 'publish' !== $post->post_status ) : ?><span class="utlc-badge"><?php echo esc_html( 'pending' === $post->post_status ? '심사 중' : $post->post_status ); ?></span><?php endif; ?>
			</div>
			<h1 class="utlc-single__title">
				<?php if ( '' !== $flair ) : ?><span class="utlc-badge utlc-badge--flair"><?php echo esc_html( $flair ); ?></span><?php endif; ?>
				<?php echo esc_html( $post->post_title ); ?>
			</h1>

			<?php if ( 'link' === $kind && '' !== $link ) : ?>
				<?php if ( $yt ) : ?>
					<div class="utlc-embed"><iframe src="<?php echo esc_url( 'https://www.youtube-nocookie.com/embed/' . rawurlencode( $yt ) ); ?>" title="YouTube" loading="lazy" allowfullscreen allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>
				<?php else : ?>
					<a class="utlc-linkcard" href="<?php echo esc_url( $link ); ?>" target="_blank" rel="nofollow ugc noopener">
						<span class="utlc-linkcard__icon">🔗</span>
						<span class="utlc-linkcard__text"><strong><?php echo esc_html( (string) wp_parse_url( $link, PHP_URL_HOST ) ); ?></strong><small><?php echo esc_html( $link ); ?></small></span>
					</a>
				<?php endif; ?>
			<?php endif; ?>

			<?php if ( is_array( $images ) && $images ) : ?>
				<div class="utlc-gallery<?php echo count( $images ) > 1 ? ' utlc-gallery--multi' : ''; ?>">
					<?php foreach ( $images as $img_id ) :
						$full = wp_get_attachment_image_url( (int) $img_id, 'full' );
						if ( ! $full ) {
							continue;
						}
						?>
						<a href="<?php echo esc_url( $full ); ?>" target="_blank" rel="noopener"><?php echo wp_get_attachment_image( (int) $img_id, 'large', false, array( 'loading' => 'lazy' ) ); ?></a>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>

			<div class="utlc-single__body utlc-prose">
				<?php
				if ( class_exists( 'UTLC_Content' ) && method_exists( 'UTLC_Content', 'render_post' ) ) {
					echo UTLC_Content::render_post( $post ); // phpcs:ignore -- sanitized by renderer
				} else {
					echo apply_filters( 'the_content', $post->post_content ); // phpcs:ignore
				}
				?>
			</div>

			<?php if ( 'model' === $kind && class_exists( 'UTLC_Market' ) && method_exists( 'UTLC_Market', 'render_box' ) ) : ?>
				<?php echo UTLC_Market::render_box( $post ); // phpcs:ignore -- escaped by D ?>
			<?php endif; ?>

			<div class="utlc-single__actions">
				<?php UTLC_Router::render( 'parts/vote', array( 'type' => 'post', 'id' => $post->ID, 'score' => $score, 'user_vote' => $user_vote, 'horizontal' => true ) ); ?>
				<a class="utlc-chip" href="#comments">💬 <?php echo esc_html( number_format_i18n( (int) $post->comment_count ) ); ?> 댓글</a>
				<button type="button" class="utlc-chip" data-utlc-share="<?php echo esc_url( $permalink ); ?>">↗ 공유</button>
				<?php if ( is_user_logged_in() ) : ?>
					<button type="button" class="utlc-chip" data-utlc-report="post" data-id="<?php echo esc_attr( $post->ID ); ?>">🚩 신고</button>
				<?php endif; ?>
				<?php if ( $can_manage ) : ?>
					<a class="utlc-chip" href="<?php echo esc_url( add_query_arg( 'edit', $post->ID, function_exists( 'utlc_submit_url' ) ? utlc_submit_url( $board ) : home_url( '/submit/' ) ) ); ?>">✏️ 수정</a>
					<button type="button" class="utlc-chip utlc-chip--danger" data-utlc-delete-post="<?php echo esc_attr( $post->ID ); ?>" data-redirect="<?php echo esc_url( $board && function_exists( 'utlc_board_url' ) ? utlc_board_url( $board ) : UTLC_Router::community_url() ); ?>">🗑 삭제</button>
				<?php endif; ?>
			</div>
		</article>

		<?php
		// UTLC_Comments::render() outputs its own <section id="comments" class="utlc-comments utlc-card">.
		if ( class_exists( 'UTLC_Comments' ) && method_exists( 'UTLC_Comments', 'render' ) ) {
			echo UTLC_Comments::render( $post ); // phpcs:ignore -- escaped by UTLC_Comments
		}
		?>
	</div>
	<aside class="utlc-sidebar">
		<?php UTLC_Router::render( 'parts/sidebar-board', array( 'board' => $board ) ); ?>
	</aside>
</div>
<?php wp_reset_postdata(); ?>
