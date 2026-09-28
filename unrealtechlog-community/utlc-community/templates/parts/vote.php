<?php
if ( ! defined( 'ABSPATH' ) ) exit;
$type       = isset( $type ) && 'comment' === $type ? 'comment' : 'post';
$id         = isset( $id ) ? (int) $id : 0;
$score      = isset( $score ) ? (int) $score : 0;
$user_vote  = isset( $user_vote ) ? (int) $user_vote : 0;
$horizontal = ! empty( $horizontal );
$cls        = 'utlc-vote' . ( $horizontal ? ' utlc-vote--h' : '' ) . ( 1 === $user_vote ? ' is-up' : '' ) . ( -1 === $user_vote ? ' is-down' : '' );
?>
<div class="<?php echo esc_attr( $cls ); ?>" data-type="<?php echo esc_attr( $type ); ?>" data-id="<?php echo esc_attr( $id ); ?>"><button type="button" class="utlc-vote__up" data-utlc-vote="1" aria-label="<?php echo esc_attr( '추천' ); ?>">▲</button><span class="utlc-vote__score"><?php echo esc_html( number_format_i18n( $score ) ); ?></span><button type="button" class="utlc-vote__down" data-utlc-vote="-1" aria-label="<?php echo esc_attr( '비추천' ); ?>">▼</button></div>
