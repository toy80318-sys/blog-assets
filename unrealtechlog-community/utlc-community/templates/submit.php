<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view  = isset( $view ) ? $view : UTLC_Router::view();
$board = $view['board'];
$edit  = $view['edit_post'];
?>
<div class="utlc-page">
	<div class="utlc-content">
		<div class="utlc-page-head">
			<h1><?php echo esc_html( $edit ? '글 수정' : '글쓰기' ); ?></h1>
			<?php if ( $board ) : ?><span class="utlc-muted">r/<?php echo esc_html( $board->slug ); ?></span><?php endif; ?>
		</div>
		<div class="utlc-card utlc-card--pad">
			<?php
			if ( class_exists( 'UTLC_Submit' ) && method_exists( 'UTLC_Submit', 'render_form' ) ) {
				echo UTLC_Submit::render_form( $board, $edit ); // phpcs:ignore -- escaped by C
			} else {
				echo '<p class="utlc-muted">' . esc_html( '글쓰기 기능을 사용할 수 없습니다.' ) . '</p>';
			}
			?>
		</div>
	</div>
	<aside class="utlc-sidebar">
		<div class="utlc-card utlc-side-card">
			<div class="utlc-side-card__head">📝 글쓰기 안내</div>
			<ol class="utlc-rules">
				<li>서로 존중하는 표현을 사용해 주세요.</li>
				<li>제목은 내용을 잘 설명하도록 작성해 주세요.</li>
				<li>타인의 저작물은 출처를 밝히고 허락된 범위에서만 공유해 주세요.</li>
				<li>광고·스팸 글은 삭제될 수 있습니다.</li>
			</ol>
		</div>
		<?php if ( $board ) : ?>
			<?php UTLC_Router::render( 'parts/sidebar-board', array( 'board' => $board ) ); ?>
		<?php endif; ?>
	</aside>
</div>
