<?php
if ( ! defined( 'ABSPATH' ) ) exit;
?>
<div class="utlc-auth">
	<div class="utlc-card utlc-card--pad utlc-auth__card">
		<h1 class="utlc-auth__title">회원가입</h1>
		<?php if ( ! get_option( 'users_can_register' ) ) : ?>
			<div class="utlc-alert utlc-alert--info">현재 회원가입이 제한되어 있습니다. 관리자에게 문의해 주세요.</div>
		<?php elseif ( class_exists( 'UTLC_Accounts' ) && method_exists( 'UTLC_Accounts', 'render_join_form' ) ) : ?>
			<?php echo UTLC_Accounts::render_join_form(); // phpcs:ignore -- escaped by C ?>
		<?php else : ?>
			<p class="utlc-muted">회원가입 기능을 사용할 수 없습니다.</p>
		<?php endif; ?>
		<div class="utlc-auth__links">
			<span>이미 계정이 있으신가요? <a href="<?php echo esc_url( UTLC_Router::login_url() ); ?>">로그인</a></span>
		</div>
	</div>
</div>
