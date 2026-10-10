<?php
if ( ! defined( 'ABSPATH' ) ) exit;
if ( empty( $board ) || ! class_exists( 'UTLC_Core' ) ) {
	UTLC_Router::render( 'parts/sidebar-home' );
	return;
}
$icon      = UTLC_Core::board_meta( $board, 'utlc_icon' );
$members   = (int) UTLC_Core::board_meta( $board, 'utlc_member_count' );
$rules     = UTLC_Core::rules( $board );
$flairs    = UTLC_Core::flairs( $board );
$uid       = get_current_user_id();
$is_member = $uid ? UTLC_Core::is_member( $uid, $board->term_id ) : false;
$can_post  = $uid ? UTLC_Core::can_post( $uid, $board ) : true;
$burl      = function_exists( 'utlc_board_url' ) ? utlc_board_url( $board ) : get_term_link( $board );
?>
<div class="utlc-card utlc-side-card">
	<div class="utlc-side-card__head"><?php echo esc_html( ( $icon ? $icon . ' ' : '' ) . 'r/' . $board->slug ); ?></div>
	<div class="utlc-side-card__body">
		<h3 class="utlc-side-card__title"><a href="<?php echo esc_url( is_wp_error( $burl ) ? '#' : $burl ); ?>"><?php echo esc_html( $board->name ); ?></a></h3>
		<?php if ( '' !== trim( (string) $board->description ) ) : ?>
			<p><?php echo esc_html( $board->description ); ?></p>
		<?php endif; ?>
		<div class="utlc-stats-row">
			<div class="utlc-stat"><strong data-utlc-member-count="<?php echo esc_attr( $board->term_id ); ?>"><?php echo esc_html( number_format_i18n( $members ) ); ?></strong><span>멤버</span></div>
			<div class="utlc-stat"><strong><?php echo esc_html( number_format_i18n( (int) $board->count ) ); ?></strong><span>게시글</span></div>
		</div>
		<div class="utlc-side-card__actions">
			<?php if ( $can_post ) : ?>
				<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( function_exists( 'utlc_submit_url' ) ? utlc_submit_url( $board ) : home_url( '/submit/' ) ); ?>">글쓰기</a>
			<?php endif; ?>
			<button type="button" class="utlc-btn <?php echo $is_member ? 'utlc-btn--ghost is-joined' : 'utlc-btn--ghost'; ?>" data-utlc-join data-board="<?php echo esc_attr( $board->term_id ); ?>" data-joined="<?php echo $is_member ? '1' : '0'; ?>"><?php echo esc_html( $is_member ? '가입됨' : '가입하기' ); ?></button>
		</div>
		<?php if ( $flairs ) : ?>
			<div class="utlc-side-card__flairs">
				<?php foreach ( $flairs as $f ) : ?>
					<span class="utlc-badge utlc-badge--flair"><?php echo esc_html( $f ); ?></span>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>
	</div>
</div>
<?php if ( $rules ) : ?>
	<div class="utlc-card utlc-side-card">
		<div class="utlc-side-card__head">r/<?php echo esc_html( $board->slug ); ?> 규칙</div>
		<ol class="utlc-rules">
			<?php foreach ( $rules as $r ) : ?>
				<li><?php echo esc_html( $r ); ?></li>
			<?php endforeach; ?>
		</ol>
	</div>
<?php endif; ?>
