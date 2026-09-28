<?php
/**
 * Installer: tables, default boards, legacy migration/backfill.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class UTLC_Install {

	public static function init() {
		// Hooks are registered from the bootstrap file (maybe_upgrade on init:20).
	}

	public static function activate() {
		self::create_tables();

		if ( false === get_option( 'utlc_settings', false ) ) {
			add_option( 'utlc_settings', utlc_default_settings() );
		}

		if ( class_exists( 'UTLC_Core' ) ) {
			UTLC_Core::register();
		}

		self::create_default_boards();

		update_option( 'users_can_register', 1 );

		if ( class_exists( 'UTLC_Router' ) && method_exists( 'UTLC_Router', 'add_rewrite_rules' ) ) {
			UTLC_Router::add_rewrite_rules();
		}

		self::migrate_legacy_community();
		self::backfill_legacy();

		update_option( 'utlc_db_version', UTLC_DB_VERSION );
		update_option( 'utlc_just_activated', 1, false );
		flush_rewrite_rules();
		self::purge_page_caches();
	}

	/**
	 * Empty full-page caches so visitors see the community front page right away
	 * instead of the cached blog home (WP Super Cache serves cached HTML without running PHP).
	 */
	public static function purge_page_caches() {
		if ( function_exists( 'wp_cache_clear_cache' ) ) {
			wp_cache_clear_cache();
		}
		if ( function_exists( 'w3tc_flush_all' ) ) {
			w3tc_flush_all();
		}
		if ( function_exists( 'rocket_clean_domain' ) ) {
			rocket_clean_domain();
		}
		if ( isset( $GLOBALS['wp_fastest_cache'] ) && method_exists( $GLOBALS['wp_fastest_cache'], 'deleteCache' ) ) {
			$GLOBALS['wp_fastest_cache']->deleteCache( true );
		}
		do_action( 'litespeed_purge_all' );
		if ( function_exists( 'wp_cache_flush' ) ) {
			wp_cache_flush();
		}
	}

	public static function maybe_upgrade() {
		if ( (string) get_option( 'utlc_db_version' ) === (string) UTLC_DB_VERSION ) {
			return;
		}
		self::create_tables();
		if ( taxonomy_exists( 'utlc_board' ) ) {
			self::create_default_boards();
		}
		update_option( 'utlc_db_version', UTLC_DB_VERSION );
		flush_rewrite_rules();
	}

	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$p       = $wpdb->prefix;

		$sql = array();

		$sql[] = "CREATE TABLE {$p}utlc_votes (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  object_type varchar(10) NOT NULL DEFAULT '',
  object_id bigint(20) unsigned NOT NULL DEFAULT 0,
  value tinyint(4) NOT NULL DEFAULT 0,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY  (id),
  UNIQUE KEY user_object (user_id,object_type,object_id),
  KEY object (object_type,object_id)
) $charset;";

		$sql[] = "CREATE TABLE {$p}utlc_reports (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  object_type varchar(10) NOT NULL DEFAULT '',
  object_id bigint(20) unsigned NOT NULL DEFAULT 0,
  reporter_id bigint(20) unsigned NOT NULL DEFAULT 0,
  reason varchar(50) NOT NULL DEFAULT '',
  details text NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY  (id),
  UNIQUE KEY reporter_object (reporter_id,object_type,object_id),
  KEY object (object_type,object_id),
  KEY status (status)
) $charset;";

		$sql[] = "CREATE TABLE {$p}utlc_orders (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  order_key varchar(64) NOT NULL DEFAULT '',
  listing_id bigint(20) unsigned NOT NULL DEFAULT 0,
  buyer_id bigint(20) unsigned NOT NULL DEFAULT 0,
  seller_id bigint(20) unsigned NOT NULL DEFAULT 0,
  amount int(11) NOT NULL DEFAULT 0,
  fee_amount int(11) NOT NULL DEFAULT 0,
  seller_amount int(11) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'pending',
  gateway varchar(20) NOT NULL DEFAULT '',
  payment_key varchar(200) NOT NULL DEFAULT '',
  depositor varchar(100) NOT NULL DEFAULT '',
  note text NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at datetime NULL DEFAULT NULL,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY  (id),
  UNIQUE KEY order_key (order_key),
  KEY buyer (buyer_id,status),
  KEY seller (seller_id,status),
  KEY listing (listing_id)
) $charset;";

		$sql[] = "CREATE TABLE {$p}utlc_payouts (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  seller_id bigint(20) unsigned NOT NULL DEFAULT 0,
  amount int(11) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'requested',
  bank_info text NULL,
  admin_note text NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at datetime NULL DEFAULT NULL,
  PRIMARY KEY  (id),
  KEY seller (seller_id,status)
) $charset;";

		foreach ( $sql as $q ) {
			dbDelta( $q );
		}
	}

	public static function default_boards() {
		return array(
			array(
				'slug'   => 'free',
				'name'   => '자유게시판',
				'desc'   => '언리얼 엔진·게임 개발 이야기를 자유롭게 나누는 공간입니다.',
				'type'   => 'general',
				'icon'   => '💬',
				'color'  => '#ff4500',
				'perm'   => 'members',
				'flairs' => '잡담,작품공유,정보,뉴스',
				'rules'  => "서로 존중해 주세요.\n광고·도배 글은 삭제됩니다.\n저작권을 침해하는 자료를 올리지 마세요.",
				'order'  => 1,
			),
			array(
				'slug'   => 'qna',
				'name'   => '질문·답변',
				'desc'   => '언리얼 엔진 관련 질문과 답변을 나누는 게시판입니다.',
				'type'   => 'general',
				'icon'   => '❓',
				'color'  => '#0079d3',
				'perm'   => 'members',
				'flairs' => '질문,해결됨',
				'rules'  => "제목에 핵심 내용을 적어 주세요.\n엔진 버전과 오류 메시지를 함께 적어 주세요.\n해결되면 '해결됨' 플레어로 바꿔 주세요.",
				'order'  => 2,
			),
			array(
				'slug'   => 'market',
				'name'   => '모델 마켓',
				'desc'   => '3D 모델·에셋을 사고파는 마켓입니다.',
				'type'   => 'market',
				'icon'   => '🛒',
				'color'  => '#46a758',
				'perm'   => 'members',
				'flairs' => '캐릭터,환경,소품,차량,머티리얼,기타',
				'rules'  => "본인이 권리를 가진 모델만 판매할 수 있습니다.\n미리보기 이미지는 실제 결과물과 같아야 합니다.\n판매 글은 운영진 심사 후 공개됩니다.",
				'order'  => 3,
			),
			array(
				'slug'   => 'techlog',
				'name'   => '테크로그 (공식)',
				'desc'   => '언리얼테크로그 공식 블로그 글이 올라오는 게시판입니다.',
				'type'   => 'official',
				'icon'   => '📘',
				'color'  => '#1a1a1b',
				'perm'   => 'admins',
				'flairs' => '',
				'rules'  => "언리얼테크로그 공식 글이 올라오는 게시판입니다.\n댓글로 자유롭게 의견을 남겨 주세요.",
				'order'  => 4,
			),
		);
	}

	public static function create_default_boards() {
		if ( ! taxonomy_exists( 'utlc_board' ) ) {
			return;
		}
		foreach ( self::default_boards() as $b ) {
			$term = get_term_by( 'slug', $b['slug'], 'utlc_board' );
			if ( $term ) {
				$term_id = (int) $term->term_id;
			} else {
				$res = wp_insert_term( $b['name'], 'utlc_board', array( 'slug' => $b['slug'], 'description' => $b['desc'] ) );
				if ( is_wp_error( $res ) ) {
					continue;
				}
				$term_id = (int) $res['term_id'];
			}
			$meta = array(
				'utlc_type'         => $b['type'],
				'utlc_icon'         => $b['icon'],
				'utlc_color'        => $b['color'],
				'utlc_rules'        => $b['rules'],
				'utlc_flairs'       => $b['flairs'],
				'utlc_post_perm'    => $b['perm'],
				'utlc_order'        => $b['order'],
				'utlc_member_count' => 0,
			);
			foreach ( $meta as $k => $v ) {
				if ( ! metadata_exists( 'term', $term_id, $k ) ) {
					add_term_meta( $term_id, $k, $v, true );
				}
			}
		}
	}

	/**
	 * Move posts of the earlier custom community (post type utl_item) into utlc_post.
	 *
	 * @return int number of migrated posts.
	 */
	public static function migrate_legacy_community() {
		global $wpdb;

		if ( class_exists( 'UTLC_Core' ) && ! post_type_exists( 'utlc_post' ) ) {
			UTLC_Core::register();
		}

		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s ORDER BY ID ASC", 'utl_item' ) );
		if ( empty( $ids ) ) {
			return 0;
		}

		$count = 0;
		foreach ( $ids as $id ) {
			$id = (int) $id;
			if ( ! set_post_type( $id, 'utlc_post' ) ) {
				continue;
			}
			clean_post_cache( $id );
			$count++;

			update_post_meta( $id, '_utlc_migrated_from', 'utl_item' );
			update_post_meta( $id, '_utlc_format', 'html' );
			if ( ! metadata_exists( 'post', $id, '_utlc_kind' ) ) {
				update_post_meta( $id, '_utlc_kind', 'text' );
			}

			// Map old utl_community term slug to a new board.
			$old_slugs = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT t.slug FROM {$wpdb->term_relationships} tr
					INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
					INNER JOIN {$wpdb->terms} t ON t.term_id = tt.term_id
					WHERE tr.object_id = %d AND tt.taxonomy = %s",
					$id,
					'utl_community'
				)
			);
			$old_slug  = ! empty( $old_slugs ) ? rawurldecode( $old_slugs[0] ) : '';
			$new_slug  = self::map_legacy_slug( $old_slug );
			$board     = get_term_by( 'slug', $new_slug, 'utlc_board' );
			if ( ! $board ) {
				$board = get_term_by( 'slug', 'free', 'utlc_board' );
			}
			if ( $board ) {
				$has = wp_get_object_terms( $id, 'utlc_board', array( 'fields' => 'ids' ) );
				if ( empty( $has ) || is_wp_error( $has ) ) {
					wp_set_object_terms( $id, array( (int) $board->term_id ), 'utlc_board', false );
				}
			}
			if ( 'showcase' === $old_slug && ! get_post_meta( $id, '_utlc_flair', true ) ) {
				update_post_meta( $id, '_utlc_flair', '작품공유' );
			}

			self::ensure_score_meta( $id );
		}
		return $count;
	}

	/**
	 * Map a legacy utl_community slug to a utlc_board slug.
	 */
	public static function map_legacy_slug( $old_slug ) {
		$map = array(
			'free'      => 'free',
			'questions' => 'qna',
			'showcase'  => 'free',
			'jobs'      => 'free',
			'tutorials' => 'techlog',
		);
		return isset( $map[ $old_slug ] ) ? $map[ $old_slug ] : 'free';
	}

	/**
	 * Link every published blog post without a board to the mapped/legacy board.
	 *
	 * @return int number of posts linked.
	 */
	public static function backfill_legacy() {
		global $wpdb;

		if ( ! taxonomy_exists( 'utlc_board' ) && class_exists( 'UTLC_Core' ) ) {
			UTLC_Core::register();
		}

		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT p.ID FROM {$wpdb->posts} p
				WHERE p.post_type = %s AND p.post_status = %s
				AND NOT EXISTS (
					SELECT 1 FROM {$wpdb->term_relationships} tr
					INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
					WHERE tr.object_id = p.ID AND tt.taxonomy = %s
				)
				ORDER BY p.ID ASC",
				'post',
				'publish',
				'utlc_board'
			)
		);

		$count = 0;
		foreach ( (array) $ids as $id ) {
			$id    = (int) $id;
			$board = class_exists( 'UTLC_Core' ) ? UTLC_Core::legacy_board_for( $id ) : null;
			if ( ! $board ) {
				continue;
			}
			$res = wp_set_object_terms( $id, array( (int) $board->term_id ), 'utlc_board', false );
			if ( ! is_wp_error( $res ) ) {
				$count++;
			}
			self::ensure_score_meta( $id );
		}

		// Also make sure every published blog post has score/hot meta.
		$missing = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT p.ID FROM {$wpdb->posts} p
				LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
				WHERE p.post_type IN ('post','utlc_post') AND p.post_status = %s AND m.meta_id IS NULL",
				'_utlc_hot',
				'publish'
			)
		);
		foreach ( (array) $missing as $id ) {
			self::ensure_score_meta( (int) $id );
		}

		return $count;
	}

	/**
	 * Add _utlc_score / _utlc_hot meta if missing.
	 */
	public static function ensure_score_meta( $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post ) {
			return;
		}
		if ( class_exists( 'UTLC_Core' ) ) {
			UTLC_Core::refresh_post_score( $post_id );
			return;
		}
		if ( ! metadata_exists( 'post', $post_id, '_utlc_score' ) ) {
			update_post_meta( $post_id, '_utlc_score', 0 );
		}
	}
}
