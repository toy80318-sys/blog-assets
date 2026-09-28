<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$redirect = isset( $_GET['redirect_to'] ) ? wp_validate_redirect( esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ), UTLC_Router::community_url() ) : UTLC_Router::community_url();
$failed   = isset( $_GET['login'] ) && 'failed' === $_GET['login'];
?>
<div class="utlc-auth">
	<div class="utlc-card utlc-card--pad utlc-auth__card">
		<h1 class="utlc-auth__title">로그인</h1>
		<p class="utlc-muted"><?php echo esc_html( UTLC_Router::opt( 'community_name', '커뮤니티' ) ); ?>에 오신 것을 환영합니다.</p>
		<?php if ( $failed ) : ?>
			<div class="utlc-alert utlc-alert--error">아이디 또는 비밀번호가 올바르지 않습니다.</div>
		<?php endif; ?>
		<div class="utlc-auth__form">
			<?php
			wp_login_form(
				array(
					'redirect'       => $redirect,
					'form_id'        => 'utlc-loginform',
					'label_username' => '아이디 또는 이메일',
					'label_password' => '비밀번호',
					'label_remember' => '로그인 상태 유지',
					'label_log_in'   => '로그인',
					'remember'       => true,
				)
			);
			?>
		</div>
		<div class="utlc-auth__links">
			<a href="<?php echo esc_url( wp_lostpassword_url( $redirect ) ); ?>">비밀번호를 잊으셨나요?</a>
			<?php if ( get_option( 'users_can_register' ) ) : ?>
				<span>계정이 없으신가요? <a href="<?php echo esc_url( function_exists( 'utlc_join_url' ) ? utlc_join_url() : home_url( '/join/' ) ); ?>">회원가입</a></span>
			<?php endif; ?>
		</div>
	</div>
</div>
