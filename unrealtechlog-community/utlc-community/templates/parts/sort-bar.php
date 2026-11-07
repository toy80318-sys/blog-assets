<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$view     = isset( $view ) ? $view : UTLC_Router::view();
$base_url = isset( $base_url ) ? $base_url : UTLC_Router::community_url();
$sorts    = array( 'hot' => '🔥 인기', 'new' => '🆕 최신', 'top' => '🏆 추천순' );
$periods  = array( 'day' => '오늘', 'week' => '이번 주', 'month' => '이번 달', 'year' => '올해', 'all' => '전체' );
?>
<div class="utlc-card utlc-sortbar">
	<div class="utlc-sortbar__tabs">
		<?php foreach ( $sorts as $key => $label ) : ?>
			<a class="utlc-sortbar__tab<?php echo $key === $view['sort'] ? ' is-active' : ''; ?>" href="<?php echo esc_url( UTLC_Router::feed_url( $base_url, array( 'sort' => $key, 'pg' => null ) ) ); ?>"><?php echo esc_html( $label ); ?></a>
		<?php endforeach; ?>
	</div>
	<?php if ( 'top' === $view['sort'] ) : ?>
		<div class="utlc-sortbar__periods">
			<?php foreach ( $periods as $key => $label ) : ?>
				<a class="utlc-sortbar__period<?php echo $key === $view['t'] ? ' is-active' : ''; ?>" href="<?php echo esc_url( UTLC_Router::feed_url( $base_url, array( 'sort' => 'top', 't' => $key, 'pg' => null ) ) ); ?>"><?php echo esc_html( $label ); ?></a>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>
	<?php if ( '' !== $view['q'] ) : ?>
		<div class="utlc-sortbar__search utlc-muted">
			"<?php echo esc_html( $view['q'] ); ?>" 검색 결과 · <a href="<?php echo esc_url( $base_url ); ?>">검색 해제</a>
		</div>
	<?php endif; ?>
</div>
