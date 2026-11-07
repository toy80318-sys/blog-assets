<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$pages    = isset( $pages ) ? (int) $pages : 1;
$pg       = isset( $pg ) ? max( 1, (int) $pg ) : 1;
$base_url = isset( $base_url ) ? $base_url : UTLC_Router::community_url();
if ( $pages <= 1 ) {
	return;
}
$start = max( 1, $pg - 2 );
$end   = min( $pages, $pg + 2 );
?>
<nav class="utlc-pagination" aria-label="<?php echo esc_attr( '페이지' ); ?>">
	<?php if ( $pg > 1 ) : ?>
		<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="<?php echo esc_url( UTLC_Router::feed_url( $base_url, array( 'pg' => $pg - 1 ) ) ); ?>">‹ 이전</a>
	<?php endif; ?>
	<?php for ( $i = $start; $i <= $end; $i++ ) : ?>
		<?php if ( $i === $pg ) : ?>
			<span class="utlc-pagination__current"><?php echo esc_html( $i ); ?></span>
		<?php else : ?>
			<a class="utlc-pagination__num" href="<?php echo esc_url( UTLC_Router::feed_url( $base_url, array( 'pg' => $i ) ) ); ?>"><?php echo esc_html( $i ); ?></a>
		<?php endif; ?>
	<?php endfor; ?>
	<?php if ( $pg < $pages ) : ?>
		<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="<?php echo esc_url( UTLC_Router::feed_url( $base_url, array( 'pg' => $pg + 1 ) ) ); ?>">다음 ›</a>
	<?php endif; ?>
</nav>
