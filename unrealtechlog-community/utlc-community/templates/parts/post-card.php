<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$post = isset( $post ) ? get_post( $post ) : null;
if ( ! $post ) {
	return;
}
$user_vote  = isset( $user_vote ) ? (int) $user_vote : 0;
$show_board = isset( $show_board ) ? (bool) $show_board : true;
$has_core   = class_exists( 'UTLC_Core' );
$board      = ( $has_core && method_exists( 'UTLC_Core', 'post_board' ) ) ? UTLC_Core::post_board( $post ) : null;
$kind       = get_post_meta( $post->ID, '_utlc_kind', true );
$kind       = $kind ? $kind : 'text';
$score      = (int) get_post_meta( $post->ID, '_utlc_score', true );
$url        = get_permalink( $post );
$author     = get_userdata( $post->post_author );
$flair      = (string) get_post_meta( $post->ID, '_utlc_flair', true );
$pinned     = '1' === (string) get_post_meta( $post->ID, '_utlc_pinned', true );
$link       = (string) get_post_meta( $post->ID, '_utlc_url', true );
$ago        = function_exists( 'utlc_time_ago' ) ? utlc_time_ago( $post->post_date_gmt ) : get_the_date( '', $post );

// Excerpt.
$is_md = 'utlc_post' === $post->post_type && 'md' === get_post_meta( $post->ID, '_utlc_format', true );
if ( $is_md && class_exists( 'UTLC_Content' ) && method_exists( 'UTLC_Content', 'excerpt' ) ) {
	$excerpt_html = UTLC_Content::excerpt( $post->post_content, 160 ); // already escaped
} else {
	$raw          = has_excerpt( $post ) ? $post->post_excerpt : $post->post_content;
	$excerpt_html = esc_html( wp_trim_words( wp_strip_all_tags( strip_shortcodes( $raw ) ), 40, '…' ) );
}

// Thumbnail.
$thumb = get_the_post_thumbnail_url( $post, 'medium' );
if ( ! $thumb ) {
	$imgs = get_post_meta( $post->ID, '_utlc_images', true );
	if ( is_array( $imgs ) && $imgs ) {
		$thumb = wp_get_attachment_image_url( (int) reset( $imgs ), 'medium' );
	}
}
$icon = ( $board && method_exists( 'UTLC_Core', 'board_meta' ) ) ? UTLC_Core::board_meta( $board, 'utlc_icon' ) : '';
?>
<article class="utlc-card utlc-post-card<?php echo $pinned ? ' is-pinned' : ''; ?>">
	<div class="utlc-post-card__vote">
		<?php UTLC_Router::render( 'parts/vote', array( 'type' => 'post', 'id' => $post->ID, 'score' => $score, 'user_vote' => $user_vote, 'horizontal' => false ) ); ?>
	</div>
	<div class="utlc-post-card__body">
		<div class="utlc-post-card__meta utlc-muted">
			<?php if ( $show_board && $board ) : ?>
				<a class="utlc-post-card__board" href="<?php echo esc_url( function_exists( 'utlc_board_url' ) ? utlc_board_url( $board ) : get_term_link( $board ) ); ?>"><span class="utlc-board-icon"><?php echo esc_html( $icon ? $icon : '#' ); ?></span>r/<?php echo esc_html( $board->slug ); ?></a>
				<span aria-hidden="true">·</span>
			<?php endif; ?>
			<?php if ( $author ) : ?>
				<a href="<?php echo esc_url( function_exists( 'utlc_user_url' ) ? utlc_user_url( $author ) : '#' ); ?>">u/<?php echo esc_html( $author->user_nicename ); ?></a>
				<span aria-hidden="true">·</span>
			<?php endif; ?>
			<time datetime="<?php echo esc_attr( mysql2date( 'c', $post->post_date_gmt, false ) ); ?>"><?php echo esc_html( $ago ); ?></time>
			<?php if ( $pinned ) : ?><span class="utlc-badge utlc-badge--pin">📌 고정</span><?php endif; ?>
			<?php if ( 'publish' !== $post->post_status ) : ?><span class="utlc-badge"><?php echo esc_html( 'pending' === $post->post_status ? '심사 중' : $post->post_status ); ?></span><?php endif; ?>
		</div>
		<h2 class="utlc-post-card__title">
			<?php if ( '' !== $flair ) : ?><span class="utlc-badge utlc-badge--flair"><?php echo esc_html( $flair ); ?></span><?php endif; ?>
			<a href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $post->post_title ); ?></a>
		</h2>
		<?php if ( 'model' === $kind && class_exists( 'UTLC_Market' ) && method_exists( 'UTLC_Market', 'price_badge' ) ) : ?>
			<div class="utlc-post-card__price"><?php echo wp_kses_post( UTLC_Market::price_badge( $post ) ); ?></div>
		<?php endif; ?>
		<?php if ( 'link' === $kind && '' !== $link ) : ?>
			<a class="utlc-post-card__link" href="<?php echo esc_url( $link ); ?>" target="_blank" rel="nofollow ugc noopener">🔗 <?php echo esc_html( (string) wp_parse_url( $link, PHP_URL_HOST ) ); ?> ↗</a>
		<?php endif; ?>
		<div class="utlc-post-card__content">
			<?php if ( $thumb ) : ?>
				<a class="utlc-post-card__thumb" href="<?php echo esc_url( $url ); ?>"><img src="<?php echo esc_url( $thumb ); ?>" alt="" loading="lazy"></a>
			<?php endif; ?>
			<?php if ( '' !== trim( wp_strip_all_tags( $excerpt_html ) ) ) : ?>
				<p class="utlc-post-card__excerpt"><?php echo $excerpt_html; // phpcs:ignore -- escaped above ?></p>
			<?php endif; ?>
		</div>
		<div class="utlc-post-card__footer">
			<a class="utlc-chip" href="<?php echo esc_url( $url . '#comments' ); ?>">💬 <?php echo esc_html( number_format_i18n( (int) $post->comment_count ) ); ?> 댓글</a>
			<button type="button" class="utlc-chip" data-utlc-share="<?php echo esc_url( $url ); ?>">↗ 공유</button>
		</div>
	</div>
</article>
