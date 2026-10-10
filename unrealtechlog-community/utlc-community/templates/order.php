<?php
/**
 * Order / checkout status page.
 *
 * @package UTLC
 */

if ( ! defined( 'ABSPATH' ) ) exit;

if ( class_exists( 'UTLC_Market' ) ) {
	UTLC_Market::render_order_page( get_query_var( 'utlc_order' ) );
}
