<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$boards = ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'boards' ) ) ? UTLC_Core::boards() : array();
$uid    = get_current_user_id();
?>
<div class="utlc-page utlc-page--wide">
	<div class="utlc-content">
		<div class="utlc-page-head">
			<h1>게시판 목록</h1>
			<span class="utlc-muted">관심 있는 게시판에 가입해 보세요.</span>
		</div>
		<?php if ( $boards ) : ?>
			<div class="utlc-grid">
				<?php foreach ( $boards as $b ) :
					$icon      = UTLC_Core::board_meta( $b, 'utlc_icon' );
					$color     = sanitize_hex_color( (string) UTLC_Core::board_meta( $b, 'utlc_color' ) );
					$members   = (int) UTLC_Core::board_meta( $b, 'utlc_member_count' );
					$is_member = $uid ? UTLC_Core::is_member( $uid, $b->term_id ) : false;
					$url       = function_exists( 'utlc_board_url' ) ? utlc_board_url( $b ) : get_term_link( $b );
					if ( is_wp_error( $url ) ) {
						continue;
					}
					?>
					<div class="utlc-card utlc-board-card" style="--utlc-board-color: <?php echo esc_attr( $color ? $color : '#ff4500' ); ?>">
						<div class="utlc-board-card__top">
							<span class="utlc-board-header__icon utlc-board-card__icon"><?php echo esc_html( $icon ? $icon : '#' ); ?></span>
							<div>
								<a class="utlc-board-card__name" href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $b->name ); ?></a>
								<div class="utlc-muted">r/<?php echo esc_html( $b->slug ); ?></div>
							</div>
						</div>
						<?php if ( '' !== trim( (string) $b->description ) ) : ?>
							<p class="utlc-board-card__desc"><?php echo esc_html( wp_trim_words( $b->description, 30, '…' ) ); ?></p>
						<?php endif; ?>
						<div class="utlc-board-card__foot">
							<span class="utlc-muted">멤버 <span data-utlc-member-count="<?php echo esc_attr( $b->term_id ); ?>"><?php echo esc_html( number_format_i18n( $members ) ); ?></span> · 글 <?php echo esc_html( number_format_i18n( (int) $b->count ) ); ?></span>
							<button type="button" class="utlc-btn utlc-btn--sm <?php echo $is_member ? 'utlc-btn--ghost is-joined' : 'utlc-btn--primary'; ?>" data-utlc-join data-board="<?php echo esc_attr( $b->term_id ); ?>" data-joined="<?php echo $is_member ? '1' : '0'; ?>"><?php echo esc_html( $is_member ? '가입됨' : '가입하기' ); ?></button>
						</div>
					</div>
				<?php endforeach; ?>
			</div>
		<?php else : ?>
			<div class="utlc-card utlc-empty"><p>아직 게시판이 없습니다.</p></div>
		<?php endif; ?>
	</div>
</div>
