<?php
if ( ! defined( 'ABSPATH' ) ) exit;
?>
<div class="utlc-auth">
	<div class="utlc-card utlc-card--pad utlc-empty">
		<div class="utlc-empty__icon">🤔</div>
		<h1>페이지를 찾을 수 없습니다</h1>
		<p class="utlc-muted">요청하신 게시판, 사용자 또는 게시글이 존재하지 않거나 삭제되었습니다.</p>
		<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( UTLC_Router::community_url() ); ?>">커뮤니티 홈으로</a>
	</div>
</div>
