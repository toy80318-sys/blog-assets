<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$boards = ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'boards' ) ) ? UTLC_Core::boards() : array();
$name   = UTLC_Router::opt( 'community_name', '커뮤니티' );
?>
<div class="utlc-card utlc-side-card">
	<?php $hero = function_exists( 'utlc_asset_img' ) ? utlc_asset_img( 'hero' ) : ''; ?>
	<?php if ( $hero ) : ?>
		<img class="utlc-side-card__hero" src="<?php echo esc_url( $hero ); ?>" alt="" loading="lazy">
	<?php endif; ?>
	<div class="utlc-side-card__head">🏠 홈</div>
	<div class="utlc-side-card__body">
		<h3 class="utlc-side-card__title"><?php echo esc_html( $name ); ?></h3>
		<p>언리얼 엔진 개발자와 3D 아티스트를 위한 커뮤니티입니다. 질문하고, 작품을 공유하고, 3D 모델을 사고팔 수 있어요.</p>
		<div class="utlc-side-card__actions">
			<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( function_exists( 'utlc_submit_url' ) ? utlc_submit_url() : home_url( '/submit/' ) ); ?>">글쓰기</a>
			<?php if ( ! is_user_logged_in() ) : ?>
				<a class="utlc-btn utlc-btn--ghost" href="<?php echo esc_url( function_exists( 'utlc_join_url' ) ? utlc_join_url() : home_url( '/join/' ) ); ?>">회원가입</a>
			<?php endif; ?>
		</div>
	</div>
</div>
<?php if ( $boards ) : ?>
	<div class="utlc-card utlc-side-card">
		<div class="utlc-side-card__head">게시판</div>
		<ul class="utlc-board-list">
			<?php foreach ( $boards as $b ) :
				$icon = UTLC_Core::board_meta( $b, 'utlc_icon' );
				$url  = function_exists( 'utlc_board_url' ) ? utlc_board_url( $b ) : get_term_link( $b );
				if ( is_wp_error( $url ) ) {
					continue;
				}
				?>
				<li>
					<a href="<?php echo esc_url( $url ); ?>">
						<span class="utlc-board-icon"><?php echo esc_html( $icon ? $icon : '#' ); ?></span>
						<span class="utlc-board-list__name"><?php echo esc_html( $b->name ); ?><small class="utlc-muted">r/<?php echo esc_html( $b->slug ); ?></small></span>
					</a>
				</li>
			<?php endforeach; ?>
		</ul>
		<div class="utlc-side-card__body"><a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="<?php echo esc_url( home_url( '/communities/' ) ); ?>">전체 게시판 보기</a></div>
	</div>
<?php endif; ?>
