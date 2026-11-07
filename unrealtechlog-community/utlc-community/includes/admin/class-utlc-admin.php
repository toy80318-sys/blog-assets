<?php
/**
 * UTL Community — wp-admin screens.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Admin {

	const PER_PAGE = 20;

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_filter( 'parent_file', array( __CLASS__, 'parent_file' ) );
		add_filter( 'submenu_file', array( __CLASS__, 'submenu_file' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_action( 'admin_notices', array( __CLASS__, 'admin_notices' ) );

		add_action( 'admin_post_utlc_admin_migrate', array( __CLASS__, 'handle_migrate' ) );
		add_action( 'admin_post_utlc_admin_backfill', array( __CLASS__, 'handle_backfill' ) );
		add_action( 'admin_post_utlc_admin_order', array( __CLASS__, 'handle_order' ) );
		add_action( 'admin_post_utlc_admin_payout', array( __CLASS__, 'handle_payout' ) );
		add_action( 'admin_post_utlc_admin_report', array( __CLASS__, 'handle_report' ) );
		add_action( 'admin_post_utlc_admin_settings', array( __CLASS__, 'handle_settings' ) );

		add_action( 'utlc_board_add_form_fields', array( __CLASS__, 'board_add_fields' ) );
		add_action( 'utlc_board_edit_form_fields', array( __CLASS__, 'board_edit_fields' ), 10, 2 );
		add_action( 'created_utlc_board', array( __CLASS__, 'board_save' ) );
		add_action( 'edited_utlc_board', array( __CLASS__, 'board_save' ) );
		add_filter( 'manage_edit-utlc_board_columns', array( __CLASS__, 'board_columns' ) );
		add_filter( 'manage_utlc_board_custom_column', array( __CLASS__, 'board_column' ), 10, 3 );

		add_action( 'show_user_profile', array( __CLASS__, 'user_fields' ) );
		add_action( 'edit_user_profile', array( __CLASS__, 'user_fields' ) );
		add_action( 'personal_options_update', array( __CLASS__, 'user_save' ) );
		add_action( 'edit_user_profile_update', array( __CLASS__, 'user_save' ) );

		add_action( 'add_meta_boxes_utlc_post', array( __CLASS__, 'add_meta_box' ) );
		add_action( 'save_post_utlc_post', array( __CLASS__, 'save_meta_box' ), 10, 2 );
	}

	/* ------------------------------------------------------------------ helpers */

	protected static function settings() {
		if ( function_exists( 'utlc_settings' ) ) {
			return (array) utlc_settings();
		}
		$saved = get_option( 'utlc_settings', array() );
		return array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
	}

	protected static function defaults() {
		if ( function_exists( 'utlc_default_settings' ) ) {
			return (array) utlc_default_settings();
		}
		return array(
			'community_name' => '언리얼테크로그 커뮤니티', 'front_page' => 1, 'legacy_board' => 'techlog', 'category_map' => array(),
			'legacy_vote_bar' => 1, 'posts_per_page' => 20, 'post_rate_per_hour' => 10, 'comment_rate_per_hour' => 60,
			'image_max_mb' => 10, 'images_per_post' => 10, 'market_review' => 1, 'commission_rate' => 20,
			'model_max_mb' => 200, 'model_extensions' => 'zip,7z,rar,fbx,obj,glb,gltf,blend,uasset,umap,usd,usdz,stl,abc,ma,mb,max,c4d,3ds,dae,ply,spp,sbsar',
			'min_price' => 1000, 'max_price' => 5000000, 'gateway_bank' => 1, 'bank_name' => '', 'bank_account' => '', 'bank_holder' => '',
			'gateway_toss' => 0, 'toss_client_key' => '', 'toss_secret_key' => '', 'min_payout' => 10000,
			'market_notice' => '', 'refund_notice' => '', 'report_threshold' => 5,
		);
	}

	protected static function boards() {
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'boards' ) ) {
			$b = UTLC_Core::boards();
			if ( is_array( $b ) ) {
				return $b;
			}
		}
		$terms = taxonomy_exists( 'utlc_board' ) ? get_terms( array( 'taxonomy' => 'utlc_board', 'hide_empty' => false ) ) : array();
		return is_wp_error( $terms ) ? array() : $terms;
	}

	protected static function krw( $n ) {
		if ( function_exists( 'utlc_krw' ) ) {
			return utlc_krw( (int) $n );
		}
		return number_format( (int) $n ) . '원';
	}

	protected static function notice( $msg, $type = 'success' ) {
		set_transient( 'utlc_admin_notice_' . get_current_user_id(), array( 'msg' => $msg, 'type' => $type ), 120 );
	}

	protected static function back( $fallback_page = 'utlc-community' ) {
		$ref = wp_get_referer();
		wp_safe_redirect( $ref ? $ref : admin_url( 'admin.php?page=' . $fallback_page ) );
		exit;
	}

	protected static function guard( $cap, $nonce_action ) {
		if ( ! current_user_can( $cap ) ) {
			wp_die( esc_html__( '권한이 없습니다.', 'utlc' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $nonce_action );
	}

	protected static function table_exists( $table ) {
		global $wpdb;
		return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) ) === $table;
	}

	protected static function user_label( $uid ) {
		$u = $uid ? get_userdata( (int) $uid ) : false;
		if ( ! $u ) {
			return '<span class="utlc-a-muted">#' . (int) $uid . '</span>';
		}
		return '<a href="' . esc_url( get_edit_user_link( $u->ID ) ) . '">' . esc_html( $u->display_name ) . '</a> <span class="utlc-a-muted">(' . esc_html( $u->user_login ) . ')</span>';
	}

	protected static function status_label( $s ) {
		$map = array(
			'pending' => '입금 대기', 'paid' => '결제 완료', 'cancelled' => '취소', 'refunded' => '환불', 'failed' => '실패',
			'requested' => '지급 요청', 'rejected' => '반려', 'open' => '접수', 'dismissed' => '무시됨', 'hidden' => '숨김 처리',
		);
		$label = isset( $map[ $s ] ) ? $map[ $s ] : $s;
		return '<span class="utlc-a-badge utlc-a-badge--' . esc_attr( $s ) . '">' . esc_html( $label ) . '</span>';
	}

	protected static function pagination( $total, $paged, $base_args ) {
		$pages = (int) ceil( $total / self::PER_PAGE );
		if ( $pages < 2 ) {
			return;
		}
		echo '<div class="tablenav"><div class="tablenav-pages">';
		echo paginate_links( array( // phpcs:ignore WordPress.Security.EscapeOutput
			'base'      => add_query_arg( array_merge( $base_args, array( 'paged' => '%#%' ) ), admin_url( 'admin.php' ) ),
			'format'    => '',
			'current'   => $paged,
			'total'     => $pages,
			'prev_text' => '‹',
			'next_text' => '›',
		) );
		echo '</div></div>';
	}

	protected static function status_filter( $page, $statuses, $current ) {
		echo '<ul class="subsubsub">';
		$i = 0;
		foreach ( $statuses as $key => $label ) {
			$url = admin_url( 'admin.php?page=' . $page . ( '' !== $key ? '&status=' . $key : '' ) );
			echo ( $i++ ? ' | ' : '' ) . '<li><a href="' . esc_url( $url ) . '"' . ( $current === $key ? ' class="current"' : '' ) . '>' . esc_html( $label ) . '</a></li>';
		}
		echo '</ul><div class="clear"></div>';
	}

	protected static function action_button( $action, $nonce, $fields, $label, $class = 'button', $confirm = '' ) {
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="utlc-a-inline"'
			. ( $confirm ? ' onsubmit="return confirm(\'' . esc_js( $confirm ) . '\');"' : '' ) . '>';
		echo '<input type="hidden" name="action" value="' . esc_attr( $action ) . '">';
		wp_nonce_field( $nonce );
		foreach ( $fields as $k => $v ) {
			echo '<input type="hidden" name="' . esc_attr( $k ) . '" value="' . esc_attr( $v ) . '">';
		}
		echo '<button type="submit" class="' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
	}

	protected static function result_text( $r ) {
		if ( is_wp_error( $r ) ) {
			return $r->get_error_message();
		}
		if ( is_array( $r ) ) {
			$parts = array();
			foreach ( $r as $k => $v ) {
				$parts[] = $k . ': ' . ( is_scalar( $v ) ? $v : wp_json_encode( $v ) );
			}
			return implode( ', ', $parts );
		}
		if ( is_bool( $r ) ) {
			return $r ? '완료' : '변경 없음';
		}
		return (string) $r;
	}

	/* ------------------------------------------------------------------ menu */

	public static function menu() {
		add_menu_page( '커뮤니티', '커뮤니티', 'manage_options', 'utlc-community', array( __CLASS__, 'page_overview' ), 'dashicons-groups', 26 );
		add_submenu_page( 'utlc-community', '개요', '개요', 'manage_options', 'utlc-community', array( __CLASS__, 'page_overview' ) );
		add_submenu_page( 'utlc-community', '게시판', '게시판', 'manage_categories', 'edit-tags.php?taxonomy=utlc_board&post_type=utlc_post' );
		add_submenu_page( 'utlc-community', '판매 심사', '판매 심사', 'edit_others_posts', 'edit.php?post_type=utlc_post&post_status=pending' );
		add_submenu_page( 'utlc-community', '주문 관리', '주문 관리', 'manage_options', 'utlc-orders', array( __CLASS__, 'page_orders' ) );
		add_submenu_page( 'utlc-community', '정산 관리', '정산 관리', 'manage_options', 'utlc-payouts', array( __CLASS__, 'page_payouts' ) );
		add_submenu_page( 'utlc-community', '신고 관리', '신고 관리', 'moderate_comments', 'utlc-reports', array( __CLASS__, 'page_reports' ) );
		add_submenu_page( 'utlc-community', '설정', '설정', 'manage_options', 'utlc-settings', array( __CLASS__, 'page_settings' ) );
	}

	public static function parent_file( $parent ) {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && ( 'utlc_board' === $screen->taxonomy || 'utlc_post' === $screen->post_type ) ) {
			return 'utlc-community';
		}
		return $parent;
	}

	public static function submenu_file( $file ) {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && 'utlc_board' === $screen->taxonomy ) {
			return 'edit-tags.php?taxonomy=utlc_board&post_type=utlc_post';
		}
		if ( $screen && 'edit-utlc_post' === $screen->id && isset( $_GET['post_status'] ) && 'pending' === $_GET['post_status'] ) { // phpcs:ignore
			return 'edit.php?post_type=utlc_post&post_status=pending';
		}
		return $file;
	}

	public static function enqueue() {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		$page   = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore
		$ours   = 0 === strpos( $page, 'utlc' ) || ( $screen && ( 'utlc_board' === $screen->taxonomy || 'utlc_post' === $screen->post_type || in_array( $screen->base, array( 'profile', 'user-edit' ), true ) ) );
		if ( $ours && defined( 'UTLC_URL' ) ) {
			wp_enqueue_style( 'utlc-admin', UTLC_URL . 'assets/css/utlc-admin.css', array(), defined( 'UTLC_VERSION' ) ? UTLC_VERSION : '1.0.0' );
		}
	}

	public static function admin_notices() {
		$key = 'utlc_admin_notice_' . get_current_user_id();
		$n   = get_transient( $key );
		if ( $n && is_array( $n ) ) {
			delete_transient( $key );
			$type = in_array( $n['type'], array( 'success', 'error', 'warning', 'info' ), true ) ? $n['type'] : 'info';
			echo '<div class="notice notice-' . esc_attr( $type ) . ' is-dismissible"><p>' . esc_html( $n['msg'] ) . '</p></div>';
		}
		if ( current_user_can( 'manage_options' ) && get_option( 'utlc_just_activated' ) ) {
			delete_option( 'utlc_just_activated' );
			$home = function_exists( 'utlc_community_url' ) ? utlc_community_url() : home_url( '/' );
			echo '<div class="notice notice-success is-dismissible"><p><strong>UTLC 커뮤니티가 켜졌습니다.</strong> '
				. '<a href="' . esc_url( $home ) . '" target="_blank" rel="noopener">커뮤니티 홈 열기</a> · '
				. '<a href="' . esc_url( admin_url( 'admin.php?page=utlc-community' ) ) . '">기존 데이터 점검</a>. '
				. esc_html( '페이지 캐시를 비웠습니다. 그래도 예전 블로그 화면이 보이면 상단의 "캐시 삭제"를 한 번 누르고 새로고침하세요.' ) . '</p></div>';
		}
		if ( current_user_can( 'manage_options' ) && '' === (string) get_option( 'permalink_structure' ) ) {
			echo '<div class="notice notice-error"><p><strong>UTL 커뮤니티:</strong> 고유주소(퍼머링크)가 "기본"으로 설정되어 있어 커뮤니티 주소(/r/…, /u/…)가 동작하지 않습니다. '
				. '<a href="' . esc_url( admin_url( 'options-permalink.php' ) ) . '">고유주소 설정</a>에서 "글 이름" 등으로 변경하세요.</p></div>';
		}
	}

	/* ------------------------------------------------------------------ overview */

	public static function page_overview() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		global $wpdb;
		$p = $wpdb->prefix;

		$utlc_counts = wp_count_posts( 'utlc_post' );
		$boards      = self::boards();
		$orders_t    = $p . 'utlc_orders';
		$payouts_t   = $p . 'utlc_payouts';
		$reports_t   = $p . 'utlc_reports';
		$has_orders  = self::table_exists( $orders_t );
		$has_payouts = self::table_exists( $payouts_t );
		$has_reports = self::table_exists( $reports_t );

		$pending_orders = $has_orders ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$orders_t} WHERE status = %s", 'pending' ) ) : 0;
		$paid_sum       = $has_orders ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount),0) FROM {$orders_t} WHERE status = %s", 'paid' ) ) : 0;
		$payout_req     = $has_payouts ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$payouts_t} WHERE status = %s", 'requested' ) ) : 0;
		$open_reports   = $has_reports ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$reports_t} WHERE status = %s", 'open' ) ) : 0;

		$cards = array(
			array( '커뮤니티 글 (공개)', number_format( isset( $utlc_counts->publish ) ? (int) $utlc_counts->publish : 0 ), admin_url( 'edit.php?post_type=utlc_post' ) ),
			array( '심사 대기', number_format( isset( $utlc_counts->pending ) ? (int) $utlc_counts->pending : 0 ), admin_url( 'edit.php?post_type=utlc_post&post_status=pending' ) ),
			array( '게시판', number_format( count( $boards ) ), admin_url( 'edit-tags.php?taxonomy=utlc_board&post_type=utlc_post' ) ),
			array( '입금 대기 주문', number_format( $pending_orders ), admin_url( 'admin.php?page=utlc-orders&status=pending' ) ),
			array( '누적 결제액', self::krw( $paid_sum ), admin_url( 'admin.php?page=utlc-orders&status=paid' ) ),
			array( '정산 요청', number_format( $payout_req ), admin_url( 'admin.php?page=utlc-payouts&status=requested' ) ),
			array( '미처리 신고', number_format( $open_reports ), admin_url( 'admin.php?page=utlc-reports' ) ),
		);
		?>
		<div class="wrap utlc-admin">
			<h1>커뮤니티 개요</h1>
			<div class="utlc-a-cards">
				<?php foreach ( $cards as $c ) : ?>
					<a class="utlc-a-card" href="<?php echo esc_url( $c[2] ); ?>">
						<span class="utlc-a-card__label"><?php echo esc_html( $c[0] ); ?></span>
						<strong class="utlc-a-card__value"><?php echo esc_html( $c[1] ); ?></strong>
					</a>
				<?php endforeach; ?>
			</div>

			<div class="utlc-a-danger">
				<strong>⚠ 미디어 보호 경고</strong>
				<p>이 사이트의 미디어 라이브러리(wp-content/uploads)는 다른 블로그(appnote-kr.blogspot.com, scenenote-kr.blogspot.com, jjantech-note.blogspot.com, haetaekcheck.com)에서 직접 링크(핫링크)하여 사용 중입니다.
				<strong>기존 미디어 파일을 절대 삭제하거나 업로드 경로/폴더 구조를 변경하지 마세요.</strong> 이미지가 다른 블로그에서 모두 깨집니다.</p>
			</div>

			<h2>기존 데이터 점검</h2>
			<?php self::render_inventory(); ?>

			<h2>도구</h2>
			<div class="utlc-a-tools">
				<?php
				self::action_button( 'utlc_admin_migrate', 'utlc_admin_migrate', array(), '이전 커뮤니티 글 가져오기', 'button button-primary', '이전 커뮤니티(utl_item) 글을 새 커뮤니티 글로 전환합니다. 계속할까요?' );
				self::action_button( 'utlc_admin_backfill', 'utlc_admin_backfill', array(), '기존 블로그 글 게시판 연결 다시 적용', 'button', '게시판이 없는 기존 블로그 글에 게시판을 연결합니다. 글 내용은 변경되지 않습니다. 계속할까요?' );
				?>
				<p class="description">두 작업 모두 글 내용·주소·댓글·미디어를 변경하지 않으며, 게시판 연결과 점수 메타만 추가합니다.</p>
			</div>
		</div>
		<?php
	}

	protected static function render_inventory() {
		global $wpdb;

		$posts    = wp_count_posts( 'post' );
		$pages    = wp_count_posts( 'page' );
		$attach   = wp_count_attachments();
		$att_tot  = 0;
		foreach ( (array) $attach as $k => $v ) {
			if ( 'trash' !== $k ) {
				$att_tot += (int) $v;
			}
		}
		$comments = wp_count_comments();
		$users    = count_users();
		$cats     = get_categories( array( 'hide_empty' => false ) );
		$utlc     = wp_count_posts( 'utlc_post' );

		$status_labels = array( 'publish' => '공개', 'future' => '예약', 'draft' => '임시', 'pending' => '대기', 'private' => '비공개', 'trash' => '휴지통' );

		// Previous community.
		$legacy_rows  = $wpdb->get_results( $wpdb->prepare( "SELECT post_status, COUNT(*) AS c FROM {$wpdb->posts} WHERE post_type = %s GROUP BY post_status", 'utl_item' ) );
		$legacy_terms = $wpdb->get_results( $wpdb->prepare(
			"SELECT t.term_id, t.name, t.slug, tt.count FROM {$wpdb->terms} t INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_id = t.term_id WHERE tt.taxonomy = %s ORDER BY t.name ASC",
			'utl_community'
		) );
		$migrated     = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key = %s", '_utlc_migrated_from' ) );
		$linked       = (int) $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
			 INNER JOIN {$wpdb->term_relationships} tr ON tr.object_id = p.ID
			 INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
			 WHERE p.post_type = %s AND p.post_status = %s AND tt.taxonomy = %s",
			'post', 'publish', 'utlc_board'
		) );

		// Plugins.
		$kboard_table = $wpdb->prefix . 'kboard_board_setting';
		$plugins      = array(
			'bbPress'         => class_exists( 'bbPress' ),
			'BuddyPress'      => class_exists( 'BuddyPress' ),
			'wpForo'          => class_exists( 'wpForo' ) || class_exists( 'wpforo\\wpforo' ) || defined( 'WPFORO_VERSION' ),
			'KBoard'          => defined( 'KBOARD_VERSION' ) || self::table_exists( $kboard_table ),
			'Asgaros Forum'   => class_exists( 'AsgarosForum' ),
			'WooCommerce'     => class_exists( 'WooCommerce' ),
			'Easy Digital Downloads' => class_exists( 'Easy_Digital_Downloads' ),
			'Ultimate Member' => class_exists( 'UM' ) || defined( 'ultimatemember_version' ),
			'Yoast SEO'       => defined( 'WPSEO_VERSION' ),
			'Rank Math'       => class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ),
			'WP Super Cache'  => defined( 'WPCACHEHOME' ) || function_exists( 'wp_cache_phase2' ),
		);

		// Health.
		$private_dir = '';
		$prot        = array();
		if ( class_exists( 'UTLC_Market' ) && method_exists( 'UTLC_Market', 'private_dir' ) ) {
			$private_dir = (string) UTLC_Market::private_dir();
			foreach ( array( '.htaccess', 'index.php', 'web.config' ) as $f ) {
				$prot[ $f ] = $private_dir && file_exists( trailingslashit( $private_dir ) . $f );
			}
		}
		?>
		<div class="utlc-a-grid">
			<div class="utlc-a-box">
				<h3>블로그 콘텐츠</h3>
				<table class="widefat striped">
					<tbody>
					<?php foreach ( $status_labels as $st => $lbl ) : ?>
						<tr><th>글 (<?php echo esc_html( $lbl ); ?>)</th><td><?php echo esc_html( number_format( isset( $posts->$st ) ? (int) $posts->$st : 0 ) ); ?></td></tr>
					<?php endforeach; ?>
					<tr><th>페이지 (공개)</th><td><?php echo esc_html( number_format( isset( $pages->publish ) ? (int) $pages->publish : 0 ) ); ?></td></tr>
					<tr><th>미디어(첨부파일)</th><td><?php echo esc_html( number_format( $att_tot ) ); ?></td></tr>
					<tr><th>댓글 (승인)</th><td><?php echo esc_html( number_format( (int) $comments->approved ) ); ?></td></tr>
					<tr><th>댓글 (대기)</th><td><?php echo esc_html( number_format( (int) $comments->moderated ) ); ?></td></tr>
					<tr><th>게시판 연결된 블로그 글</th><td><?php echo esc_html( number_format( $linked ) ); ?> / <?php echo esc_html( number_format( isset( $posts->publish ) ? (int) $posts->publish : 0 ) ); ?></td></tr>
					</tbody>
				</table>
			</div>

			<div class="utlc-a-box">
				<h3>사용자</h3>
				<table class="widefat striped">
					<tbody>
					<tr><th>전체</th><td><?php echo esc_html( number_format( (int) $users['total_users'] ) ); ?></td></tr>
					<?php foreach ( (array) $users['avail_roles'] as $role => $n ) : ?>
						<tr><th><?php echo esc_html( $role ); ?></th><td><?php echo esc_html( number_format( (int) $n ) ); ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			</div>

			<div class="utlc-a-box">
				<h3>카테고리</h3>
				<table class="widefat striped">
					<thead><tr><th>이름</th><th>슬러그</th><th>글 수</th></tr></thead>
					<tbody>
					<?php if ( empty( $cats ) ) : ?>
						<tr><td colspan="3">없음</td></tr>
					<?php endif; ?>
					<?php foreach ( $cats as $cat ) : ?>
						<tr><td><?php echo esc_html( $cat->name ); ?></td><td><code><?php echo esc_html( $cat->slug ); ?></code></td><td><?php echo esc_html( number_format( (int) $cat->count ) ); ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			</div>

			<div class="utlc-a-box">
				<h3>새 커뮤니티 (utlc)</h3>
				<table class="widefat striped">
					<tbody>
					<?php foreach ( $status_labels as $st => $lbl ) : ?>
						<tr><th>커뮤니티 글 (<?php echo esc_html( $lbl ); ?>)</th><td><?php echo esc_html( number_format( isset( $utlc->$st ) ? (int) $utlc->$st : 0 ) ); ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
				<table class="widefat striped utlc-a-mt">
					<thead><tr><th>게시판</th><th>슬러그</th><th>글 수</th></tr></thead>
					<tbody>
					<?php if ( empty( $boards = self::boards() ) ) : ?>
						<tr><td colspan="3">게시판 없음 (플러그인 활성화 시 생성)</td></tr>
					<?php endif; ?>
					<?php foreach ( $boards as $b ) : ?>
						<tr><td><?php echo esc_html( $b->name ); ?></td><td><code><?php echo esc_html( $b->slug ); ?></code></td><td><?php echo esc_html( number_format( (int) $b->count ) ); ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			</div>

			<div class="utlc-a-box">
				<h3>이전 커뮤니티 (utl_item / utl_community)</h3>
				<table class="widefat striped">
					<thead><tr><th>상태</th><th>글 수</th></tr></thead>
					<tbody>
					<?php if ( empty( $legacy_rows ) ) : ?>
						<tr><td colspan="2">utl_item 글 없음 (가져오기 완료 또는 해당 없음)</td></tr>
					<?php endif; ?>
					<?php foreach ( (array) $legacy_rows as $r ) : ?>
						<tr><td><?php echo esc_html( $r->post_status ); ?></td><td><?php echo esc_html( number_format( (int) $r->c ) ); ?></td></tr>
					<?php endforeach; ?>
					<tr><th>가져온 글 (_utlc_migrated_from)</th><td><?php echo esc_html( number_format( $migrated ) ); ?></td></tr>
					</tbody>
				</table>
				<table class="widefat striped utlc-a-mt">
					<thead><tr><th>이전 게시판</th><th>슬러그</th><th>글 수</th></tr></thead>
					<tbody>
					<?php if ( empty( $legacy_terms ) ) : ?>
						<tr><td colspan="3">utl_community 용어 없음</td></tr>
					<?php endif; ?>
					<?php foreach ( (array) $legacy_terms as $t ) : ?>
						<tr><td><?php echo esc_html( $t->name ); ?></td><td><code><?php echo esc_html( $t->slug ); ?></code></td><td><?php echo esc_html( number_format( (int) $t->count ) ); ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			</div>

			<div class="utlc-a-box">
				<h3>플러그인 감지</h3>
				<table class="widefat striped">
					<tbody>
					<?php foreach ( $plugins as $name => $on ) : ?>
						<tr><th><?php echo esc_html( $name ); ?></th><td><?php echo $on ? '<span class="utlc-a-ok">사용 중</span>' : '<span class="utlc-a-muted">없음</span>'; ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
				<?php if ( $plugins['WP Super Cache'] ) : ?>
					<p class="description">WP Super Cache: 캐시 제외 경로에 <code>/utlc-pay/</code>, <code>/utlc-download/</code>, <code>/checkout/</code> 를 추가하세요. (로그인 사용자는 캐시를 우회합니다)</p>
				<?php endif; ?>
			</div>

			<div class="utlc-a-box">
				<h3>상태 점검</h3>
				<table class="widefat striped">
					<tbody>
					<tr><th>고유주소</th><td><?php echo '' !== (string) get_option( 'permalink_structure' ) ? '<span class="utlc-a-ok">사용 (' . esc_html( get_option( 'permalink_structure' ) ) . ')</span>' : '<span class="utlc-a-bad">기본(동작 안 함)</span>'; ?></td></tr>
					<tr><th>회원가입 허용</th><td><?php echo get_option( 'users_can_register' ) ? '<span class="utlc-a-ok">허용</span>' : '<span class="utlc-a-bad">꺼짐 (설정 &gt; 일반에서 허용)</span>'; ?></td></tr>
					<tr><th>upload_max_filesize</th><td><?php echo esc_html( (string) ini_get( 'upload_max_filesize' ) ); ?></td></tr>
					<tr><th>post_max_size</th><td><?php echo esc_html( (string) ini_get( 'post_max_size' ) ); ?></td></tr>
					<tr><th>wp_max_upload_size</th><td><?php echo esc_html( size_format( wp_max_upload_size() ) ); ?></td></tr>
					<tr><th>비공개 폴더</th><td><?php echo $private_dir ? '<code>' . esc_html( $private_dir ) . '</code>' : '<span class="utlc-a-muted">마켓 모듈 없음</span>'; ?></td></tr>
					<?php foreach ( $prot as $f => $ok ) : ?>
						<tr><th>보호 파일 <?php echo esc_html( $f ); ?></th><td><?php echo $ok ? '<span class="utlc-a-ok">있음</span>' : '<span class="utlc-a-bad">없음</span>'; ?></td></tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			</div>
		</div>
		<?php
	}

	public static function handle_migrate() {
		self::guard( 'manage_options', 'utlc_admin_migrate' );
		if ( class_exists( 'UTLC_Install' ) && method_exists( 'UTLC_Install', 'migrate_legacy_community' ) ) {
			$r = UTLC_Install::migrate_legacy_community();
			self::notice( '이전 커뮤니티 글 가져오기 결과 — ' . self::result_text( $r ), is_wp_error( $r ) ? 'error' : 'success' );
		} else {
			self::notice( '설치 모듈(UTLC_Install)을 찾을 수 없습니다.', 'error' );
		}
		self::back();
	}

	public static function handle_backfill() {
		self::guard( 'manage_options', 'utlc_admin_backfill' );
		if ( class_exists( 'UTLC_Install' ) && method_exists( 'UTLC_Install', 'backfill_legacy' ) ) {
			$r = UTLC_Install::backfill_legacy();
			self::notice( '기존 블로그 글 게시판 연결 결과 — ' . self::result_text( $r ), is_wp_error( $r ) ? 'error' : 'success' );
		} else {
			self::notice( '설치 모듈(UTLC_Install)을 찾을 수 없습니다.', 'error' );
		}
		self::back();
	}

	/* ------------------------------------------------------------------ orders */

	public static function page_orders() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		global $wpdb;
		$table    = $wpdb->prefix . 'utlc_orders';
		$statuses = array( '' => '전체', 'pending' => '입금 대기', 'paid' => '결제 완료', 'cancelled' => '취소', 'refunded' => '환불', 'failed' => '실패' );
		$status   = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : ''; // phpcs:ignore
		if ( ! isset( $statuses[ $status ] ) ) {
			$status = '';
		}
		$paged = max( 1, isset( $_GET['paged'] ) ? absint( $_GET['paged'] ) : 1 ); // phpcs:ignore

		echo '<div class="wrap utlc-admin"><h1>주문 관리</h1>';
		if ( ! self::table_exists( $table ) ) {
			echo '<p>주문 테이블이 없습니다. 플러그인을 다시 활성화하세요.</p></div>';
			return;
		}
		self::status_filter( 'utlc-orders', $statuses, $status );

		$where = $status ? $wpdb->prepare( 'WHERE status = %s', $status ) : '';
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where}" ); // phpcs:ignore
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} {$where} ORDER BY id DESC LIMIT %d OFFSET %d", self::PER_PAGE, ( $paged - 1 ) * self::PER_PAGE ) ); // phpcs:ignore
		?>
		<table class="widefat striped utlc-a-table">
			<thead><tr>
				<th>#</th><th>주문키</th><th>상품</th><th>구매자</th><th>판매자</th><th>금액</th><th>수수료</th><th>정산액</th>
				<th>결제수단</th><th>입금자명</th><th>상태</th><th>주문일</th><th>결제일</th><th>작업</th>
			</tr></thead>
			<tbody>
			<?php if ( empty( $rows ) ) : ?>
				<tr><td colspan="14">주문이 없습니다.</td></tr>
			<?php endif; ?>
			<?php foreach ( (array) $rows as $o ) : ?>
				<tr>
					<td><?php echo (int) $o->id; ?></td>
					<td><code><?php echo esc_html( $o->order_key ); ?></code></td>
					<td>
						<?php
						$lp = get_post( (int) $o->listing_id );
						echo $lp ? '<a href="' . esc_url( get_edit_post_link( $lp->ID ) ) . '">' . esc_html( get_the_title( $lp ) ) . '</a>' : '#' . (int) $o->listing_id;
						?>
					</td>
					<td><?php echo self::user_label( $o->buyer_id ); // phpcs:ignore ?></td>
					<td><?php echo self::user_label( $o->seller_id ); // phpcs:ignore ?></td>
					<td><?php echo esc_html( self::krw( $o->amount ) ); ?></td>
					<td><?php echo esc_html( self::krw( $o->fee_amount ) ); ?></td>
					<td><?php echo esc_html( self::krw( $o->seller_amount ) ); ?></td>
					<td><?php echo esc_html( $o->gateway ); ?></td>
					<td><?php echo esc_html( $o->depositor ); ?></td>
					<td><?php echo self::status_label( $o->status ); // phpcs:ignore ?><?php echo $o->note ? '<br><small class="utlc-a-muted">' . esc_html( $o->note ) . '</small>' : ''; ?></td>
					<td><?php echo esc_html( $o->created_at ); ?></td>
					<td><?php echo esc_html( (string) $o->paid_at ); ?></td>
					<td class="utlc-a-actions">
						<?php
						$f = array( 'order_id' => (int) $o->id );
						if ( 'pending' === $o->status || 'failed' === $o->status ) {
							self::action_button( 'utlc_admin_order', 'utlc_admin_order', $f + array( 'do' => 'paid' ), '입금 확인', 'button button-primary button-small', '입금을 확인하고 결제 완료 처리할까요?' );
						}
						if ( 'pending' === $o->status ) {
							self::action_button( 'utlc_admin_order', 'utlc_admin_order', $f + array( 'do' => 'cancel' ), '취소', 'button button-small', '이 주문을 취소할까요?' );
						}
						if ( 'paid' === $o->status ) {
							self::action_button( 'utlc_admin_order', 'utlc_admin_order', $f + array( 'do' => 'refund' ), '환불', 'button button-small utlc-a-btn-danger', '환불 처리할까요? (토스 결제는 결제 취소 API가 호출됩니다)' );
						}
						?>
					</td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<?php
		self::pagination( $total, $paged, array( 'page' => 'utlc-orders', 'status' => $status ) );
		echo '</div>';
	}

	public static function handle_order() {
		self::guard( 'manage_options', 'utlc_admin_order' );
		$id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
		$do = isset( $_POST['do'] ) ? sanitize_key( wp_unslash( $_POST['do'] ) ) : '';
		if ( ! $id || ! class_exists( 'UTLC_Orders' ) ) {
			self::notice( '주문 모듈을 찾을 수 없거나 잘못된 요청입니다.', 'error' );
			self::back( 'utlc-orders' );
		}
		$r = null;
		if ( 'paid' === $do && method_exists( 'UTLC_Orders', 'mark_paid' ) ) {
			$r   = UTLC_Orders::mark_paid( $id );
			$msg = '입금 확인 처리되었습니다.';
		} elseif ( 'cancel' === $do && method_exists( 'UTLC_Orders', 'set_status' ) ) {
			$r   = UTLC_Orders::set_status( $id, 'cancelled', '관리자 취소' );
			$msg = '주문이 취소되었습니다.';
		} elseif ( 'refund' === $do ) {
			if ( method_exists( 'UTLC_Orders', 'refund' ) ) {
				$r = UTLC_Orders::refund( $id );
			} elseif ( method_exists( 'UTLC_Orders', 'set_status' ) ) {
				$r = UTLC_Orders::set_status( $id, 'refunded', '관리자 환불' );
			}
			$msg = '환불 처리되었습니다.';
		} else {
			self::notice( '알 수 없는 작업입니다.', 'error' );
			self::back( 'utlc-orders' );
		}
		if ( is_wp_error( $r ) ) {
			self::notice( '실패: ' . $r->get_error_message(), 'error' );
		} elseif ( false === $r ) {
			self::notice( '처리하지 못했습니다. 주문 상태를 확인하세요.', 'error' );
		} else {
			self::notice( $msg );
		}
		self::back( 'utlc-orders' );
	}

	/* ------------------------------------------------------------------ payouts */

	public static function page_payouts() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		global $wpdb;
		$table    = $wpdb->prefix . 'utlc_payouts';
		$orders   = $wpdb->prefix . 'utlc_orders';
		$statuses = array( '' => '전체', 'requested' => '지급 요청', 'paid' => '지급 완료', 'rejected' => '반려' );
		$status   = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : ''; // phpcs:ignore
		if ( ! isset( $statuses[ $status ] ) ) {
			$status = '';
		}
		$paged = max( 1, isset( $_GET['paged'] ) ? absint( $_GET['paged'] ) : 1 ); // phpcs:ignore

		echo '<div class="wrap utlc-admin"><h1>정산 관리</h1>';
		if ( ! self::table_exists( $table ) ) {
			echo '<p>정산 테이블이 없습니다. 플러그인을 다시 활성화하세요.</p></div>';
			return;
		}
		self::status_filter( 'utlc-payouts', $statuses, $status );

		$where = $status ? $wpdb->prepare( 'WHERE status = %s', $status ) : '';
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where}" ); // phpcs:ignore
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} {$where} ORDER BY id DESC LIMIT %d OFFSET %d", self::PER_PAGE, ( $paged - 1 ) * self::PER_PAGE ) ); // phpcs:ignore
		?>
		<h2>지급 요청</h2>
		<table class="widefat striped utlc-a-table">
			<thead><tr><th>#</th><th>판매자</th><th>금액</th><th>계좌 정보</th><th>상태</th><th>요청일</th><th>처리일</th><th>관리자 메모</th><th>작업</th></tr></thead>
			<tbody>
			<?php if ( empty( $rows ) ) : ?>
				<tr><td colspan="9">정산 요청이 없습니다.</td></tr>
			<?php endif; ?>
			<?php foreach ( (array) $rows as $r ) : ?>
				<tr>
					<td><?php echo (int) $r->id; ?></td>
					<td><?php echo self::user_label( $r->seller_id ); // phpcs:ignore ?></td>
					<td><?php echo esc_html( self::krw( $r->amount ) ); ?></td>
					<td><?php echo nl2br( esc_html( (string) $r->bank_info ) ); ?></td>
					<td><?php echo self::status_label( $r->status ); // phpcs:ignore ?></td>
					<td><?php echo esc_html( $r->created_at ); ?></td>
					<td><?php echo esc_html( (string) $r->processed_at ); ?></td>
					<td><?php echo esc_html( (string) $r->admin_note ); ?></td>
					<td class="utlc-a-actions">
						<?php if ( 'requested' === $r->status ) : ?>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="utlc-a-inline">
								<input type="hidden" name="action" value="utlc_admin_payout">
								<input type="hidden" name="payout_id" value="<?php echo (int) $r->id; ?>">
								<?php wp_nonce_field( 'utlc_admin_payout' ); ?>
								<input type="text" name="admin_note" placeholder="메모(선택)" class="regular-text utlc-a-note">
								<button type="submit" name="do" value="paid" class="button button-primary button-small" onclick="return confirm('<?php echo esc_js( '송금을 완료했습니까? 지급 완료로 처리합니다.' ); ?>');">지급 완료</button>
								<button type="submit" name="do" value="rejected" class="button button-small" onclick="return confirm('<?php echo esc_js( '이 정산 요청을 반려할까요?' ); ?>');">반려</button>
							</form>
						<?php endif; ?>
					</td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<?php
		self::pagination( $total, $paged, array( 'page' => 'utlc-payouts', 'status' => $status ) );

		// Seller balances.
		$sellers = array();
		if ( self::table_exists( $orders ) ) {
			$sellers = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT seller_id FROM {$orders} WHERE status = %s", 'paid' ) ); // phpcs:ignore
		}
		$sellers = array_unique( array_merge( array_map( 'intval', (array) $sellers ), array_map( 'intval', (array) $wpdb->get_col( "SELECT DISTINCT seller_id FROM {$table}" ) ) ) ); // phpcs:ignore
		?>
		<h2>판매자 잔액</h2>
		<table class="widefat striped utlc-a-table">
			<thead><tr><th>판매자</th><th>총 정산액</th><th>지급 완료</th><th>지급 대기</th><th>출금 가능</th></tr></thead>
			<tbody>
			<?php if ( empty( $sellers ) || ! class_exists( 'UTLC_Orders' ) || ! method_exists( 'UTLC_Orders', 'balance' ) ) : ?>
				<tr><td colspan="5">표시할 판매자가 없습니다.</td></tr>
			<?php else : ?>
				<?php foreach ( $sellers as $sid ) : ?>
					<?php
					if ( ! $sid ) {
						continue;
					}
					$b = (array) UTLC_Orders::balance( $sid );
					?>
					<tr>
						<td><?php echo self::user_label( $sid ); // phpcs:ignore ?></td>
						<td><?php echo esc_html( self::krw( isset( $b['earned'] ) ? $b['earned'] : 0 ) ); ?></td>
						<td><?php echo esc_html( self::krw( isset( $b['paid_out'] ) ? $b['paid_out'] : 0 ) ); ?></td>
						<td><?php echo esc_html( self::krw( isset( $b['pending'] ) ? $b['pending'] : 0 ) ); ?></td>
						<td><strong><?php echo esc_html( self::krw( isset( $b['available'] ) ? $b['available'] : 0 ) ); ?></strong></td>
					</tr>
				<?php endforeach; ?>
			<?php endif; ?>
			</tbody>
		</table>
		</div>
		<?php
	}

	public static function handle_payout() {
		self::guard( 'manage_options', 'utlc_admin_payout' );
		global $wpdb;
		$table = $wpdb->prefix . 'utlc_payouts';
		$id    = isset( $_POST['payout_id'] ) ? absint( $_POST['payout_id'] ) : 0;
		$do    = isset( $_POST['do'] ) ? sanitize_key( wp_unslash( $_POST['do'] ) ) : '';
		$note  = isset( $_POST['admin_note'] ) ? sanitize_text_field( wp_unslash( $_POST['admin_note'] ) ) : '';
		if ( ! $id || ! in_array( $do, array( 'paid', 'rejected' ), true ) ) {
			self::notice( '잘못된 요청입니다.', 'error' );
			self::back( 'utlc-payouts' );
		}
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ) ); // phpcs:ignore
		if ( ! $row || 'requested' !== $row->status ) {
			self::notice( '이미 처리되었거나 존재하지 않는 요청입니다.', 'error' );
			self::back( 'utlc-payouts' );
		}
		$wpdb->update(
			$table,
			array( 'status' => $do, 'admin_note' => $note, 'processed_at' => current_time( 'mysql' ) ),
			array( 'id' => $id ),
			array( '%s', '%s', '%s' ),
			array( '%d' )
		);
		do_action( 'utlc_payout_processed', $id, $do );
		self::notice( 'paid' === $do ? '지급 완료로 처리했습니다.' : '정산 요청을 반려했습니다.' );
		self::back( 'utlc-payouts' );
	}

	/* ------------------------------------------------------------------ reports */

	public static function page_reports() {
		if ( ! current_user_can( 'moderate_comments' ) ) {
			return;
		}
		global $wpdb;
		$table    = $wpdb->prefix . 'utlc_reports';
		$statuses = array( 'open' => '접수', 'hidden' => '숨김 처리', 'dismissed' => '무시됨', 'all' => '전체' );
		$status   = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : 'open'; // phpcs:ignore
		if ( ! isset( $statuses[ $status ] ) ) {
			$status = 'open';
		}
		$paged = max( 1, isset( $_GET['paged'] ) ? absint( $_GET['paged'] ) : 1 ); // phpcs:ignore

		echo '<div class="wrap utlc-admin"><h1>신고 관리</h1>';
		if ( ! self::table_exists( $table ) ) {
			echo '<p>신고 테이블이 없습니다. 플러그인을 다시 활성화하세요.</p></div>';
			return;
		}
		self::status_filter( 'utlc-reports', $statuses, $status );

		$where = 'all' !== $status ? $wpdb->prepare( 'WHERE status = %s', $status ) : '';
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where}" ); // phpcs:ignore
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} {$where} ORDER BY id DESC LIMIT %d OFFSET %d", self::PER_PAGE, ( $paged - 1 ) * self::PER_PAGE ) ); // phpcs:ignore
		?>
		<table class="widefat striped utlc-a-table">
			<thead><tr><th>#</th><th>대상</th><th>신고자</th><th>사유</th><th>상세</th><th>상태</th><th>일시</th><th>작업</th></tr></thead>
			<tbody>
			<?php if ( empty( $rows ) ) : ?>
				<tr><td colspan="8">신고가 없습니다.</td></tr>
			<?php endif; ?>
			<?php foreach ( (array) $rows as $r ) : ?>
				<tr>
					<td><?php echo (int) $r->id; ?></td>
					<td><?php echo self::report_target( $r ); // phpcs:ignore ?></td>
					<td><?php echo self::user_label( $r->reporter_id ); // phpcs:ignore ?></td>
					<td><?php echo esc_html( $r->reason ); ?></td>
					<td><?php echo esc_html( wp_trim_words( (string) $r->details, 30 ) ); ?></td>
					<td><?php echo self::status_label( $r->status ); // phpcs:ignore ?></td>
					<td><?php echo esc_html( $r->created_at ); ?></td>
					<td class="utlc-a-actions">
						<?php
						if ( 'open' === $r->status ) {
							$f = array( 'report_id' => (int) $r->id );
							self::action_button( 'utlc_admin_report', 'utlc_admin_report', $f + array( 'do' => 'hide' ), '숨김', 'button button-small utlc-a-btn-danger', '대상을 숨김 처리할까요? (글: 대기 상태, 댓글: 승인 대기)' );
							self::action_button( 'utlc_admin_report', 'utlc_admin_report', $f + array( 'do' => 'dismiss' ), '무시', 'button button-small' );
						}
						?>
					</td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<?php
		self::pagination( $total, $paged, array( 'page' => 'utlc-reports', 'status' => $status ) );
		echo '</div>';
	}

	protected static function report_target( $r ) {
		$id = (int) $r->object_id;
		if ( 'comment' === $r->object_type ) {
			$c = get_comment( $id );
			if ( ! $c ) {
				return '댓글 #' . $id . ' (삭제됨)';
			}
			return '댓글 #' . $id . ': <a href="' . esc_url( admin_url( 'comment.php?action=editcomment&c=' . $id ) ) . '">'
				. esc_html( wp_trim_words( wp_strip_all_tags( $c->comment_content ), 12 ) ) . '</a> <span class="utlc-a-muted">(' . esc_html( wp_get_comment_status( $c ) ) . ')</span>';
		}
		$p = get_post( $id );
		if ( ! $p ) {
			return '글 #' . $id . ' (삭제됨)';
		}
		return '글: <a href="' . esc_url( get_edit_post_link( $p->ID ) ) . '">' . esc_html( get_the_title( $p ) ) . '</a> <span class="utlc-a-muted">(' . esc_html( $p->post_status ) . ')</span>'
			. ( 'publish' === $p->post_status ? ' <a href="' . esc_url( get_permalink( $p ) ) . '" target="_blank" rel="noopener">보기</a>' : '' );
	}

	public static function handle_report() {
		self::guard( 'moderate_comments', 'utlc_admin_report' );
		global $wpdb;
		$table = $wpdb->prefix . 'utlc_reports';
		$id    = isset( $_POST['report_id'] ) ? absint( $_POST['report_id'] ) : 0;
		$do    = isset( $_POST['do'] ) ? sanitize_key( wp_unslash( $_POST['do'] ) ) : '';
		$row   = $id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ) ) : null; // phpcs:ignore
		if ( ! $row ) {
			self::notice( '신고를 찾을 수 없습니다.', 'error' );
			self::back( 'utlc-reports' );
		}
		if ( 'hide' === $do ) {
			$oid = (int) $row->object_id;
			if ( 'comment' === $row->object_type ) {
				if ( get_comment( $oid ) ) {
					wp_set_comment_status( $oid, 'hold' );
				}
			} else {
				$p = get_post( $oid );
				if ( $p && 'post' === $p->post_type ) {
					// Existing blog posts are never modified automatically.
					$wpdb->update( $table, array( 'status' => 'dismissed' ), array( 'id' => $id ), array( '%s' ), array( '%d' ) );
					self::notice( '기존 블로그 글은 자동으로 숨기지 않습니다. 필요하면 글 편집 화면에서 직접 처리하세요.', 'warning' );
					self::back( 'utlc-reports' );
				}
				if ( $p && current_user_can( 'edit_post', $oid ) ) {
					wp_update_post( array( 'ID' => $oid, 'post_status' => 'pending' ) );
				}
			}
			$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET status = %s WHERE object_type = %s AND object_id = %d AND status = %s", 'hidden', $row->object_type, $oid, 'open' ) ); // phpcs:ignore
			self::notice( '대상을 숨김 처리했습니다.' );
		} elseif ( 'dismiss' === $do ) {
			$wpdb->update( $table, array( 'status' => 'dismissed' ), array( 'id' => $id ), array( '%s' ), array( '%d' ) );
			self::notice( '신고를 무시 처리했습니다.' );
		} else {
			self::notice( '알 수 없는 작업입니다.', 'error' );
		}
		self::back( 'utlc-reports' );
	}

	/* ------------------------------------------------------------------ settings */

	protected static function schema() {
		return array(
			'일반' => array(
				'community_name'        => array( 'text', '커뮤니티 이름' ),
				'front_page'            => array( 'bool', '사이트 첫 화면을 커뮤니티 홈으로 사용' ),
				'legacy_board'          => array( 'board', '기존 블로그 글 기본 게시판' ),
				'legacy_vote_bar'       => array( 'bool', '기존 블로그 글 하단에 추천 바 표시' ),
				'posts_per_page'        => array( 'int', '페이지당 글 수', 5, 100 ),
				'post_rate_per_hour'    => array( 'int', '시간당 글 작성 제한', 1, 1000 ),
				'comment_rate_per_hour' => array( 'int', '시간당 댓글 작성 제한', 1, 5000 ),
				'report_threshold'      => array( 'int', '자동 숨김 신고 수', 1, 1000 ),
				'image_max_mb'          => array( 'int', '이미지 최대 용량(MB)', 1, 100 ),
				'images_per_post'       => array( 'int', '글당 이미지 수', 1, 50 ),
			),
			'모델 마켓' => array(
				'market_review'    => array( 'bool', '판매 글 관리자 심사 후 공개' ),
				'commission_rate'  => array( 'int', '수수료율(%)', 0, 100 ),
				'model_max_mb'     => array( 'int', '모델 파일 최대 용량(MB)', 1, 10240 ),
				'model_extensions' => array( 'exts', '허용 확장자(쉼표 구분)' ),
				'min_price'        => array( 'int', '최소 가격(원, 무료 제외)', 0, 100000000 ),
				'max_price'        => array( 'int', '최대 가격(원)', 0, 1000000000 ),
				'min_payout'       => array( 'int', '최소 정산 요청 금액(원)', 0, 100000000 ),
				'market_notice'    => array( 'textarea', '통신판매중개 고지' ),
				'refund_notice'    => array( 'textarea', '환불(청약철회) 안내' ),
			),
			'결제' => array(
				'gateway_bank'    => array( 'bool', '무통장 입금 사용' ),
				'bank_name'       => array( 'text', '은행명' ),
				'bank_account'    => array( 'text', '계좌번호' ),
				'bank_holder'     => array( 'text', '예금주' ),
				'gateway_toss'    => array( 'bool', '토스페이먼츠 카드 결제 사용' ),
				'toss_client_key' => array( 'text', '토스 클라이언트 키' ),
				'toss_secret_key' => array( 'secret', '토스 시크릿 키' ),
			),
		);
	}

	public static function page_settings() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s      = self::settings();
		$boards = self::boards();
		$cats   = get_categories( array( 'hide_empty' => false ) );
		$map    = isset( $s['category_map'] ) && is_array( $s['category_map'] ) ? $s['category_map'] : array();
		?>
		<div class="wrap utlc-admin">
			<h1>커뮤니티 설정</h1>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="utlc_admin_settings">
				<?php wp_nonce_field( 'utlc_admin_settings' ); ?>
				<?php foreach ( self::schema() as $section => $fields ) : ?>
					<h2><?php echo esc_html( $section ); ?></h2>
					<table class="form-table" role="presentation"><tbody>
					<?php foreach ( $fields as $key => $f ) : ?>
						<?php
						$val  = isset( $s[ $key ] ) ? $s[ $key ] : '';
						$name = 'utlc[' . $key . ']';
						$fid  = 'utlc-' . $key;
						?>
						<tr>
							<th scope="row"><label for="<?php echo esc_attr( $fid ); ?>"><?php echo esc_html( $f[1] ); ?></label></th>
							<td>
							<?php
							switch ( $f[0] ) {
								case 'bool':
									echo '<label><input type="checkbox" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="1"' . checked( ! empty( $val ), true, false ) . '> 사용</label>';
									break;
								case 'int':
									echo '<input type="number" class="small-text" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( (int) $val ) . '" min="' . esc_attr( $f[2] ) . '" max="' . esc_attr( $f[3] ) . '">';
									break;
								case 'textarea':
									echo '<textarea class="large-text" rows="3" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '">' . esc_textarea( (string) $val ) . '</textarea>';
									break;
								case 'board':
									echo '<select id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '">';
									foreach ( $boards as $b ) {
										echo '<option value="' . esc_attr( $b->slug ) . '"' . selected( $val, $b->slug, false ) . '>' . esc_html( $b->name . ' (' . $b->slug . ')' ) . '</option>';
									}
									if ( empty( $boards ) ) {
										echo '<option value="' . esc_attr( $val ) . '">' . esc_html( $val ) . '</option>';
									}
									echo '</select>';
									break;
								case 'secret':
									echo '<input type="password" class="regular-text" autocomplete="new-password" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="" placeholder="' . esc_attr( $val ? '저장됨 (변경 시에만 입력)' : '' ) . '">';
									break;
								default:
									echo '<input type="text" class="regular-text" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( (string) $val ) . '">';
							}
							?>
							</td>
						</tr>
					<?php endforeach; ?>
					</tbody></table>
				<?php endforeach; ?>

				<h2>카테고리 → 게시판 연결</h2>
				<p class="description">기존 블로그 글은 카테고리에 따라 아래 게시판에 연결됩니다. 지정하지 않으면 기본 게시판을 사용합니다. 저장 후 개요의 "기존 블로그 글 게시판 연결 다시 적용"은 게시판이 없는 글에만 적용됩니다.</p>
				<table class="widefat striped utlc-a-table utlc-a-map">
					<thead><tr><th>카테고리</th><th>글 수</th><th>게시판</th></tr></thead>
					<tbody>
					<?php foreach ( $cats as $cat ) : ?>
						<tr>
							<td><?php echo esc_html( $cat->name ); ?> <code><?php echo esc_html( $cat->slug ); ?></code></td>
							<td><?php echo (int) $cat->count; ?></td>
							<td>
								<select name="utlc_map[<?php echo (int) $cat->term_id; ?>]">
									<option value="">— 기본 게시판 —</option>
									<?php foreach ( $boards as $b ) : ?>
										<option value="<?php echo esc_attr( $b->slug ); ?>" <?php selected( isset( $map[ $cat->term_id ] ) ? $map[ $cat->term_id ] : '', $b->slug ); ?>><?php echo esc_html( $b->name ); ?></option>
									<?php endforeach; ?>
								</select>
							</td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
				<?php submit_button( '설정 저장' ); ?>
			</form>
		</div>
		<?php
	}

	public static function handle_settings() {
		self::guard( 'manage_options', 'utlc_admin_settings' );
		$in   = isset( $_POST['utlc'] ) && is_array( $_POST['utlc'] ) ? wp_unslash( $_POST['utlc'] ) : array(); // phpcs:ignore
		$old  = self::settings();
		$out  = array_merge( self::defaults(), $old );
		$slugs = array();
		foreach ( self::boards() as $b ) {
			$slugs[] = $b->slug;
		}

		foreach ( self::schema() as $fields ) {
			foreach ( $fields as $key => $f ) {
				$raw = isset( $in[ $key ] ) ? $in[ $key ] : '';
				if ( is_array( $raw ) ) {
					$raw = '';
				}
				switch ( $f[0] ) {
					case 'bool':
						$out[ $key ] = empty( $raw ) ? 0 : 1;
						break;
					case 'int':
						$out[ $key ] = min( (int) $f[3], max( (int) $f[2], (int) $raw ) );
						break;
					case 'textarea':
						$out[ $key ] = sanitize_textarea_field( $raw );
						break;
					case 'board':
						$raw         = sanitize_title( $raw );
						$out[ $key ] = ( in_array( $raw, $slugs, true ) || ( empty( $slugs ) && '' !== $raw ) ) ? $raw : ( isset( $old[ $key ] ) ? $old[ $key ] : 'techlog' );
						break;
					case 'exts':
						$parts = array_filter( array_map( 'trim', explode( ',', strtolower( (string) $raw ) ) ) );
						$clean = array();
						foreach ( $parts as $p ) {
							$p = preg_replace( '/[^a-z0-9]/', '', $p );
							if ( '' !== $p && ! in_array( $p, array( 'php', 'phtml', 'phar', 'exe', 'js', 'html', 'htm', 'svg', 'sh' ), true ) ) {
								$clean[] = $p;
							}
						}
						$out[ $key ] = implode( ',', array_unique( $clean ) );
						break;
					case 'secret':
						$raw = trim( sanitize_text_field( $raw ) );
						if ( '' !== $raw ) {
							$out[ $key ] = $raw;
						}
						break;
					default:
						$out[ $key ] = sanitize_text_field( $raw );
				}
			}
		}
		if ( $out['max_price'] < $out['min_price'] ) {
			$out['max_price'] = $out['min_price'];
		}

		$map_in = isset( $_POST['utlc_map'] ) && is_array( $_POST['utlc_map'] ) ? wp_unslash( $_POST['utlc_map'] ) : array(); // phpcs:ignore
		$map    = array();
		foreach ( $map_in as $cat_id => $slug ) {
			$cat_id = absint( $cat_id );
			$slug   = sanitize_title( is_string( $slug ) ? $slug : '' );
			if ( $cat_id && '' !== $slug && in_array( $slug, $slugs, true ) ) {
				$map[ $cat_id ] = $slug;
			}
		}
		$out['category_map'] = $map;

		$front_changed = ( ! empty( $old['front_page'] ) ) !== ( ! empty( $out['front_page'] ) );
		update_option( 'utlc_settings', $out );
		if ( $front_changed ) {
			flush_rewrite_rules( false );
			if ( class_exists( 'UTLC_Install' ) && method_exists( 'UTLC_Install', 'purge_page_caches' ) ) {
				UTLC_Install::purge_page_caches();
			}
		}
		self::notice( '설정을 저장했습니다.' );
		wp_safe_redirect( admin_url( 'admin.php?page=utlc-settings' ) );
		exit;
	}

	/* ------------------------------------------------------------------ board term meta */

	protected static function board_values( $term_id = 0 ) {
		$defaults = array(
			'utlc_type' => 'general', 'utlc_icon' => '', 'utlc_color' => '#ff4500', 'utlc_rules' => '',
			'utlc_flairs' => '', 'utlc_post_perm' => 'members', 'utlc_order' => 0,
		);
		if ( ! $term_id ) {
			return $defaults;
		}
		foreach ( $defaults as $k => $d ) {
			$v = get_term_meta( $term_id, $k, true );
			if ( '' !== $v && null !== $v ) {
				$defaults[ $k ] = $v;
			}
		}
		return $defaults;
	}

	protected static function board_field_list( $v ) {
		$types = array( 'general' => '일반', 'market' => '마켓', 'official' => '공식' );
		$perms = array( 'members' => '회원 모두', 'admins' => '관리자만' );
		$f     = array();
		$o     = '';
		foreach ( $types as $k => $l ) {
			$o .= '<option value="' . esc_attr( $k ) . '"' . selected( $v['utlc_type'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		$f['utlc_type'] = array( '게시판 유형', '<select name="utlc_type" id="utlc_type">' . $o . '</select>', '마켓 유형은 3D 모델 판매 글만 작성됩니다.' );
		$f['utlc_icon'] = array( '아이콘(이모지)', '<input type="text" name="utlc_icon" id="utlc_icon" value="' . esc_attr( $v['utlc_icon'] ) . '" class="small-text" maxlength="16">', '' );
		$f['utlc_color'] = array( '색상', '<input type="color" name="utlc_color" id="utlc_color" value="' . esc_attr( $v['utlc_color'] ) . '">', '' );
		$f['utlc_rules'] = array( '규칙', '<textarea name="utlc_rules" id="utlc_rules" rows="5" class="large-text">' . esc_textarea( $v['utlc_rules'] ) . '</textarea>', '한 줄에 하나씩 입력합니다.' );
		$f['utlc_flairs'] = array( '말머리', '<input type="text" name="utlc_flairs" id="utlc_flairs" value="' . esc_attr( $v['utlc_flairs'] ) . '" class="regular-text">', '쉼표로 구분 (예: 잡담,정보,뉴스)' );
		$o = '';
		foreach ( $perms as $k => $l ) {
			$o .= '<option value="' . esc_attr( $k ) . '"' . selected( $v['utlc_post_perm'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		$f['utlc_post_perm'] = array( '글쓰기 권한', '<select name="utlc_post_perm" id="utlc_post_perm">' . $o . '</select>', '' );
		$f['utlc_order'] = array( '정렬 순서', '<input type="number" name="utlc_order" id="utlc_order" value="' . esc_attr( (int) $v['utlc_order'] ) . '" class="small-text">', '작은 숫자가 먼저 표시됩니다.' );
		return $f;
	}

	public static function board_add_fields() {
		wp_nonce_field( 'utlc_board_meta', 'utlc_board_nonce' );
		foreach ( self::board_field_list( self::board_values() ) as $k => $f ) {
			echo '<div class="form-field term-' . esc_attr( $k ) . '-wrap"><label for="' . esc_attr( $k ) . '">' . esc_html( $f[0] ) . '</label>';
			echo $f[1]; // phpcs:ignore -- built with escaping above.
			if ( $f[2] ) {
				echo '<p class="description">' . esc_html( $f[2] ) . '</p>';
			}
			echo '</div>';
		}
	}

	public static function board_edit_fields( $term ) {
		wp_nonce_field( 'utlc_board_meta', 'utlc_board_nonce' );
		foreach ( self::board_field_list( self::board_values( $term->term_id ) ) as $k => $f ) {
			echo '<tr class="form-field term-' . esc_attr( $k ) . '-wrap"><th scope="row"><label for="' . esc_attr( $k ) . '">' . esc_html( $f[0] ) . '</label></th><td>';
			echo $f[1]; // phpcs:ignore -- built with escaping above.
			if ( $f[2] ) {
				echo '<p class="description">' . esc_html( $f[2] ) . '</p>';
			}
			echo '</td></tr>';
		}
	}

	public static function board_save( $term_id ) {
		if ( ! isset( $_POST['utlc_board_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['utlc_board_nonce'] ) ), 'utlc_board_meta' ) ) {
			return;
		}
		if ( ! current_user_can( 'manage_categories' ) ) {
			return;
		}
		$p    = wp_unslash( $_POST );
		$type = isset( $p['utlc_type'] ) && in_array( $p['utlc_type'], array( 'general', 'market', 'official' ), true ) ? $p['utlc_type'] : 'general';
		$perm = isset( $p['utlc_post_perm'] ) && in_array( $p['utlc_post_perm'], array( 'members', 'admins' ), true ) ? $p['utlc_post_perm'] : 'members';
		$icon = isset( $p['utlc_icon'] ) ? sanitize_text_field( $p['utlc_icon'] ) : '';
		$icon = function_exists( 'mb_substr' ) ? mb_substr( $icon, 0, 8 ) : substr( $icon, 0, 16 );
		$color = isset( $p['utlc_color'] ) ? sanitize_hex_color( $p['utlc_color'] ) : '';
		$flairs = isset( $p['utlc_flairs'] ) ? implode( ',', array_filter( array_map( 'trim', explode( ',', sanitize_text_field( $p['utlc_flairs'] ) ) ) ) ) : '';

		update_term_meta( $term_id, 'utlc_type', $type );
		update_term_meta( $term_id, 'utlc_icon', $icon );
		update_term_meta( $term_id, 'utlc_color', $color ? $color : '#ff4500' );
		update_term_meta( $term_id, 'utlc_rules', isset( $p['utlc_rules'] ) ? sanitize_textarea_field( $p['utlc_rules'] ) : '' );
		update_term_meta( $term_id, 'utlc_flairs', $flairs );
		update_term_meta( $term_id, 'utlc_post_perm', $perm );
		update_term_meta( $term_id, 'utlc_order', isset( $p['utlc_order'] ) ? (int) $p['utlc_order'] : 0 );
	}

	public static function board_columns( $cols ) {
		$new = array();
		foreach ( $cols as $k => $v ) {
			if ( 'name' === $k ) {
				$new['utlc_icon'] = '아이콘';
			}
			$new[ $k ] = $v;
		}
		$new['utlc_type']    = '유형';
		$new['utlc_perm']    = '글쓰기';
		$new['utlc_members'] = '멤버';
		$new['utlc_order']   = '순서';
		return $new;
	}

	public static function board_column( $content, $column, $term_id ) {
		$v = self::board_values( $term_id );
		switch ( $column ) {
			case 'utlc_icon':
				return '<span class="utlc-a-icon" style="background:' . esc_attr( $v['utlc_color'] ) . '">' . esc_html( $v['utlc_icon'] ) . '</span>';
			case 'utlc_type':
				$m = array( 'general' => '일반', 'market' => '마켓', 'official' => '공식' );
				return esc_html( isset( $m[ $v['utlc_type'] ] ) ? $m[ $v['utlc_type'] ] : $v['utlc_type'] );
			case 'utlc_perm':
				return esc_html( 'admins' === $v['utlc_post_perm'] ? '관리자만' : '회원 모두' );
			case 'utlc_members':
				return esc_html( number_format( (int) get_term_meta( $term_id, 'utlc_member_count', true ) ) );
			case 'utlc_order':
				return esc_html( (string) (int) $v['utlc_order'] );
		}
		return $content;
	}

	/* ------------------------------------------------------------------ user ban */

	public static function user_fields( $user ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$banned = get_user_meta( $user->ID, '_utlc_banned', true );
		?>
		<h2>커뮤니티</h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row">커뮤니티 이용 정지</th>
				<td>
					<?php wp_nonce_field( 'utlc_user_ban', 'utlc_user_ban_nonce' ); ?>
					<label><input type="checkbox" name="utlc_banned" value="1" <?php checked( ! empty( $banned ) ); ?>> 이 사용자의 글·댓글·추천·구매를 차단합니다.</label>
					<p class="description">카르마: <?php echo esc_html( number_format( (int) get_user_meta( $user->ID, '_utlc_karma', true ) ) ); ?></p>
				</td>
			</tr>
		</table>
		<?php
	}

	public static function user_save( $user_id ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( ! isset( $_POST['utlc_user_ban_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['utlc_user_ban_nonce'] ) ), 'utlc_user_ban' ) ) {
			return;
		}
		if ( ! empty( $_POST['utlc_banned'] ) && (int) $user_id !== get_current_user_id() ) {
			update_user_meta( $user_id, '_utlc_banned', '1' );
		} else {
			delete_user_meta( $user_id, '_utlc_banned' );
		}
	}

	/* ------------------------------------------------------------------ utlc_post meta box */

	public static function add_meta_box() {
		add_meta_box( 'utlc_post_info', '커뮤니티 정보', array( __CLASS__, 'render_meta_box' ), 'utlc_post', 'side', 'high' );
	}

	public static function render_meta_box( $post ) {
		$kind  = get_post_meta( $post->ID, '_utlc_kind', true );
		$kinds = array( 'text' => '텍스트', 'image' => '이미지', 'link' => '링크', 'model' => '3D 모델' );
		$board = null;
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'post_board' ) ) {
			$board = UTLC_Core::post_board( $post );
		} else {
			$terms = get_the_terms( $post->ID, 'utlc_board' );
			$board = ( $terms && ! is_wp_error( $terms ) ) ? $terms[0] : null;
		}
		wp_nonce_field( 'utlc_meta_box', 'utlc_meta_nonce' );
		echo '<div class="utlc-a-meta">';
		echo '<p><strong>유형:</strong> ' . esc_html( isset( $kinds[ $kind ] ) ? $kinds[ $kind ] : ( $kind ? $kind : '텍스트' ) ) . '</p>';
		echo '<p><strong>게시판:</strong> ' . ( $board ? esc_html( $board->name . ' (r/' . $board->slug . ')' ) : '없음' ) . '</p>';
		echo '<p><strong>점수:</strong> ' . esc_html( (string) (int) get_post_meta( $post->ID, '_utlc_score', true ) )
			. ' <span class="utlc-a-muted">(▲' . (int) get_post_meta( $post->ID, '_utlc_ups', true ) . ' ▼' . (int) get_post_meta( $post->ID, '_utlc_downs', true ) . ')</span></p>';
		$flair = get_post_meta( $post->ID, '_utlc_flair', true );
		if ( $flair ) {
			echo '<p><strong>말머리:</strong> ' . esc_html( $flair ) . '</p>';
		}
		$reports = (int) get_post_meta( $post->ID, '_utlc_report_count', true );
		if ( $reports ) {
			echo '<p><strong>신고:</strong> ' . esc_html( (string) $reports ) . '건</p>';
		}
		$mig = get_post_meta( $post->ID, '_utlc_migrated_from', true );
		if ( $mig ) {
			echo '<p class="utlc-a-muted">이전 커뮤니티(' . esc_html( $mig ) . ')에서 가져온 글</p>';
		}
		$url = get_post_meta( $post->ID, '_utlc_url', true );
		if ( $url ) {
			echo '<p><strong>링크:</strong> <a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( wp_parse_url( $url, PHP_URL_HOST ) ) . '</a></p>';
		}

		if ( 'model' === $kind ) {
			$file    = get_post_meta( $post->ID, '_utlc_file', true );
			$formats = (array) get_post_meta( $post->ID, '_utlc_formats', true );
			$feats   = (array) get_post_meta( $post->ID, '_utlc_features', true );
			echo '<hr><h4>마켓 정보</h4>';
			echo '<p><label for="utlc_admin_price"><strong>가격(원)</strong></label><br><input type="number" min="0" step="100" id="utlc_admin_price" name="utlc_admin_price" value="' . esc_attr( (string) (int) get_post_meta( $post->ID, '_utlc_price', true ) ) . '" class="widefat"></p>';
			echo '<p><strong>라이선스:</strong> ' . esc_html( (string) get_post_meta( $post->ID, '_utlc_license', true ) ) . '</p>';
			echo '<p><strong>포맷:</strong> ' . esc_html( implode( ', ', array_filter( array_map( 'strval', $formats ) ) ) ) . '</p>';
			echo '<p><strong>폴리곤:</strong> ' . esc_html( (string) get_post_meta( $post->ID, '_utlc_polycount', true ) ) . '</p>';
			echo '<p><strong>엔진 버전:</strong> ' . esc_html( (string) get_post_meta( $post->ID, '_utlc_engine_version', true ) ) . '</p>';
			echo '<p><strong>특징:</strong> ' . esc_html( implode( ', ', array_filter( array_map( 'strval', $feats ) ) ) ) . '</p>';
			echo '<p><strong>판매/다운로드:</strong> ' . (int) get_post_meta( $post->ID, '_utlc_sales_count', true ) . ' / ' . (int) get_post_meta( $post->ID, '_utlc_download_count', true ) . '</p>';
			if ( is_array( $file ) && ! empty( $file['name'] ) ) {
				echo '<p><strong>파일:</strong> ' . esc_html( $file['name'] ) . ' <span class="utlc-a-muted">(' . esc_html( size_format( isset( $file['size'] ) ? (int) $file['size'] : 0 ) ) . ', ' . esc_html( isset( $file['ext'] ) ? $file['ext'] : '' ) . ')</span></p>';
			}
			$ext_url = get_post_meta( $post->ID, '_utlc_file_url', true );
			if ( $ext_url ) {
				echo '<p><strong>외부 링크:</strong> <a href="' . esc_url( $ext_url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( wp_parse_url( $ext_url, PHP_URL_HOST ) ) . '</a></p>';
			}
			if ( ( is_array( $file ) && ! empty( $file['name'] ) ) || $ext_url ) {
				echo '<p><a class="button" href="' . esc_url( home_url( '/utlc-download/' . $post->ID . '/' ) ) . '">관리자 다운로드</a></p>';
			}
			$glb = get_post_meta( $post->ID, '_utlc_preview_glb', true );
			if ( $glb ) {
				echo '<p><strong>GLB 미리보기:</strong> <a href="' . esc_url( $glb ) . '" target="_blank" rel="noopener">파일</a></p>';
			}
		}
		echo '</div>';
	}

	public static function save_meta_box( $post_id, $post ) {
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		if ( ! isset( $_POST['utlc_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['utlc_meta_nonce'] ) ), 'utlc_meta_box' ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		if ( isset( $_POST['utlc_admin_price'] ) && 'model' === get_post_meta( $post_id, '_utlc_kind', true ) ) {
			update_post_meta( $post_id, '_utlc_price', absint( $_POST['utlc_admin_price'] ) );
		}
	}
}
