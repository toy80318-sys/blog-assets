<?php
if ( ! defined( 'ABSPATH' ) ) exit;
if ( empty( $board ) || ! class_exists( 'UTLC_Core' ) ) {
	return;
}
$icon      = UTLC_Core::board_meta( $board, 'utlc_icon' );
$color     = sanitize_hex_color( (string) UTLC_Core::board_meta( $board, 'utlc_color' ) );
$members   = (int) UTLC_Core::board_meta( $board, 'utlc_member_count' );
$uid       = get_current_user_id();
$is_member = $uid ? UTLC_Core::is_member( $uid, $board->term_id ) : false;
$can_post  = $uid ? UTLC_Core::can_post( $uid, $board ) : true;
?>
<div class="utlc-board-header" style="--utlc-board-color: <?php echo esc_attr( $color ? $color : '#ff4500' ); ?>">
	<div class="utlc-board-header__banner"></div>
	<div class="utlc-board-header__row">
		<span class="utlc-board-header__icon"><?php echo esc_html( $icon ? $icon : '#' ); ?></span>
		<div class="utlc-board-header__titles">
			<h1 class="utlc-board-header__name"><?php echo esc_html( $board->name ); ?></h1>
			<div class="utlc-muted">r/<?php echo esc_html( $board->slug ); ?> · 멤버 <span data-utlc-member-count="<?php echo esc_attr( $board->term_id ); ?>"><?php echo esc_html( number_format_i18n( $members ) ); ?></span>명</div>
		</div>
		<div class="utlc-board-header__actions">
			<?php if ( $can_post ) : ?>
				<a class="utlc-btn utlc-btn--ghost" href="<?php echo esc_url( function_exists( 'utlc_submit_url' ) ? utlc_submit_url( $board ) : home_url( '/submit/' ) ); ?>">✏️ 글쓰기</a>
			<?php endif; ?>
			<button type="button" class="utlc-btn <?php echo $is_member ? 'utlc-btn--ghost is-joined' : 'utlc-btn--primary'; ?>" data-utlc-join data-board="<?php echo esc_attr( $board->term_id ); ?>" data-joined="<?php echo $is_member ? '1' : '0'; ?>"><?php echo esc_html( $is_member ? '가입됨' : '가입하기' ); ?></button>
		</div>
	</div>
</div>
