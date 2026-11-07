<?php
/**
 * Core: CPT, taxonomy, permalinks, boards, feed, votes, legacy hooks.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class UTLC_Core {

	private static $boards_cache = null;
	private static $in_vote_bar  = false;

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 5 );
		add_filter( 'post_type_link', array( __CLASS__, 'post_type_link' ), 10, 2 );
		add_action( 'wp_ajax_utlc_vote', array( __CLASS__, 'ajax_vote' ) );
		add_action( 'wp_ajax_nopriv_utlc_vote', array( __CLASS__, 'ajax_vote' ) );
		add_action( 'wp_ajax_utlc_join', array( __CLASS__, 'ajax_join' ) );
		add_action( 'wp_ajax_nopriv_utlc_join', array( __CLASS__, 'ajax_join' ) );
		add_action( 'transition_post_status', array( __CLASS__, 'transition_post_status' ), 10, 3 );
		add_filter( 'the_content', array( __CLASS__, 'legacy_vote_bar' ), 20 );
		add_action( 'template_redirect', array( __CLASS__, 'legacy_redirects' ), 1 );
		add_filter( 'show_admin_bar', array( __CLASS__, 'show_admin_bar' ), 20 );
		add_action( 'created_utlc_board', array( __CLASS__, 'flush_boards_cache' ) );
		add_action( 'edited_utlc_board', array( __CLASS__, 'flush_boards_cache' ) );
		add_action( 'delete_utlc_board', array( __CLASS__, 'flush_boards_cache' ) );
	}

	/* ------------------------------------------------------------------ */
	/* Registration                                                        */
	/* ------------------------------------------------------------------ */

	public static function register() {
		if ( ! post_type_exists( 'utlc_post' ) ) {
			register_post_type(
				'utlc_post',
				array(
					'labels'          => array(
						'name'               => '커뮤니티 글',
						'singular_name'      => '커뮤니티 글',
						'add_new'            => '새 글',
						'add_new_item'       => '새 커뮤니티 글',
						'edit_item'          => '커뮤니티 글 편집',
						'new_item'           => '새 커뮤니티 글',
						'view_item'          => '글 보기',
						'search_items'       => '커뮤니티 글 검색',
						'not_found'          => '글이 없습니다.',
						'not_found_in_trash' => '휴지통에 글이 없습니다.',
						'all_items'          => '커뮤니티 글',
						'menu_name'          => '커뮤니티 글',
					),
					'public'          => true,
					'show_ui'         => true,
					'show_in_menu'    => 'utlc-community',
					'supports'        => array( 'title', 'editor', 'author', 'comments', 'thumbnail' ),
					'rewrite'         => false,
					'has_archive'     => false,
					'show_in_rest'    => true,
					'map_meta_cap'    => true,
					'capability_type' => 'post',
				)
			);
		}

		if ( ! taxonomy_exists( 'utlc_board' ) ) {
			register_taxonomy(
				'utlc_board',
				array( 'utlc_post', 'post' ),
				array(
					'labels'            => array(
						'name'          => '게시판',
						'singular_name' => '게시판',
						'search_items'  => '게시판 검색',
						'all_items'     => '모든 게시판',
						'edit_item'     => '게시판 편집',
						'update_item'   => '게시판 업데이트',
						'add_new_item'  => '새 게시판 추가',
						'new_item_name' => '새 게시판 이름',
						'menu_name'     => '게시판',
						'not_found'     => '게시판이 없습니다.',
					),
					'public'            => true,
					'show_ui'           => true,
					'show_admin_column' => true,
					'show_in_rest'      => true,
					'hierarchical'      => false,
					'rewrite'           => array(
						'slug'       => 'r',
						'with_front' => false,
					),
				)
			);
		}
	}

	public static function post_type_link( $link, $post ) {
		if ( ! $post || 'utlc_post' !== $post->post_type ) {
			return $link;
		}
		$board = self::post_board( $post );
		$slug  = $board ? $board->slug : 'free';
		$path  = '/r/' . $slug . '/comments/' . (int) $post->ID . '/';
		if ( ! empty( $post->post_name ) ) {
			$path .= $post->post_name . '/';
		}
		return home_url( $path );
	}

	/* ------------------------------------------------------------------ */
	/* Boards                                                              */
	/* ------------------------------------------------------------------ */

	public static function flush_boards_cache() {
		self::$boards_cache = null;
	}

	public static function boards() {
		if ( null !== self::$boards_cache ) {
			return self::$boards_cache;
		}
		$terms = get_terms(
			array(
				'taxonomy'   => 'utlc_board',
				'hide_empty' => false,
			)
		);
		if ( is_wp_error( $terms ) || ! is_array( $terms ) ) {
			return array();
		}
		usort(
			$terms,
			function ( $a, $b ) {
				$oa = (int) get_term_meta( $a->term_id, 'utlc_order', true );
				$ob = (int) get_term_meta( $b->term_id, 'utlc_order', true );
				if ( $oa === $ob ) {
					return strcmp( $a->name, $b->name );
				}
				return ( $oa < $ob ) ? -1 : 1;
			}
		);
		self::$boards_cache = $terms;
		return $terms;
	}

	public static function board( $id_or_slug ) {
		if ( $id_or_slug instanceof WP_Term ) {
			return 'utlc_board' === $id_or_slug->taxonomy ? $id_or_slug : null;
		}
		if ( empty( $id_or_slug ) ) {
			return null;
		}
		if ( is_numeric( $id_or_slug ) ) {
			$term = get_term( (int) $id_or_slug, 'utlc_board' );
		} else {
			$term = get_term_by( 'slug', sanitize_title( $id_or_slug ), 'utlc_board' );
		}
		if ( ! $term || is_wp_error( $term ) ) {
			return null;
		}
		return $term;
	}

	public static function board_meta( $term, $key ) {
		$defaults = array(
			'utlc_type'         => 'general',
			'utlc_icon'         => '💬',
			'utlc_color'        => '#ff4500',
			'utlc_rules'        => '',
			'utlc_flairs'       => '',
			'utlc_post_perm'    => 'members',
			'utlc_order'        => 0,
			'utlc_member_count' => 0,
		);
		if ( 0 !== strpos( $key, 'utlc_' ) ) {
			$key = 'utlc_' . $key;
		}
		$term = self::board( $term );
		$def  = isset( $defaults[ $key ] ) ? $defaults[ $key ] : '';
		if ( ! $term ) {
			return $def;
		}
		$val = get_term_meta( $term->term_id, $key, true );
		if ( '' === $val || null === $val || false === $val ) {
			return $def;
		}
		if ( 'utlc_order' === $key || 'utlc_member_count' === $key ) {
			return (int) $val;
		}
		return $val;
	}

	public static function post_board( $post ) {
		$post = get_post( $post );
		if ( ! $post ) {
			return null;
		}
		$terms = get_the_terms( $post->ID, 'utlc_board' );
		if ( empty( $terms ) || is_wp_error( $terms ) ) {
			return null;
		}
		return reset( $terms );
	}

	public static function can_post( $user_id, $term ) {
		$user_id = (int) $user_id;
		$term    = self::board( $term );
		if ( ! $user_id || ! $term ) {
			return false;
		}
		if ( utlc_is_banned( $user_id ) ) {
			return false;
		}
		if ( 'admins' === self::board_meta( $term, 'utlc_post_perm' ) ) {
			return user_can( $user_id, 'edit_others_posts' );
		}
		return true;
	}

	public static function can_moderate( $user_id, $term = null ) {
		$user_id = (int) $user_id;
		if ( ! $user_id ) {
			return false;
		}
		return user_can( $user_id, 'moderate_comments' );
	}

	public static function is_member( $user_id, $term_id ) {
		$user_id = (int) $user_id;
		$term_id = (int) $term_id;
		if ( ! $user_id || ! $term_id ) {
			return false;
		}
		$vals = get_user_meta( $user_id, '_utlc_board_member', false );
		foreach ( (array) $vals as $v ) {
			if ( (int) $v === $term_id ) {
				return true;
			}
		}
		return false;
	}

	public static function set_member( $user_id, $term_id, $join ) {
		global $wpdb;
		$user_id = (int) $user_id;
		$term_id = (int) $term_id;
		if ( $user_id && $term_id ) {
			$is = self::is_member( $user_id, $term_id );
			if ( $join && ! $is ) {
				add_user_meta( $user_id, '_utlc_board_member', $term_id );
			} elseif ( ! $join && $is ) {
				delete_user_meta( $user_id, '_utlc_board_member', $term_id );
			}
		}
		$count = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(DISTINCT user_id) FROM {$wpdb->usermeta} WHERE meta_key = %s AND meta_value = %s",
				'_utlc_board_member',
				(string) $term_id
			)
		);
		update_term_meta( $term_id, 'utlc_member_count', $count );
		return $count;
	}

	public static function flairs( $term ) {
		$raw = (string) self::board_meta( $term, 'utlc_flairs' );
		$out = array();
		foreach ( explode( ',', $raw ) as $f ) {
			$f = trim( $f );
			if ( '' !== $f ) {
				$out[] = $f;
			}
		}
		return $out;
	}

	public static function rules( $term ) {
		$raw = (string) self::board_meta( $term, 'utlc_rules' );
		$out = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $raw ) as $line ) {
			$line = trim( $line );
			if ( '' !== $line ) {
				$out[] = $line;
			}
		}
		return $out;
	}

	public static function market_board() {
		foreach ( self::boards() as $b ) {
			if ( 'market' === self::board_meta( $b, 'utlc_type' ) ) {
				return $b;
			}
		}
		return self::board( 'market' );
	}

	/**
	 * Board for a legacy blog post: category_map first, then legacy_board option.
	 */
	public static function legacy_board_for( $post_id ) {
		$map = utlc_opt( 'category_map' );
		if ( is_array( $map ) && ! empty( $map ) ) {
			$cats = wp_get_post_categories( $post_id );
			foreach ( (array) $cats as $cat_id ) {
				if ( ! empty( $map[ $cat_id ] ) ) {
					$b = self::board( $map[ $cat_id ] );
					if ( $b ) {
						return $b;
					}
				}
			}
		}
		$b = self::board( utlc_opt( 'legacy_board' ) );
		if ( ! $b ) {
			$b = self::board( 'techlog' );
		}
		return $b;
	}

	/* ------------------------------------------------------------------ */
	/* Feed                                                                */
	/* ------------------------------------------------------------------ */

	public static function feed( array $args ) {
		global $wpdb;

		$defaults = array(
			'board_id'  => 0,
			'sort'      => 'hot',
			't'         => 'all',
			'page'      => 1,
			'per_page'  => (int) utlc_opt( 'posts_per_page' ),
			'author_id' => 0,
			'search'    => '',
			'kind'      => '',
		);
		$a = array_merge( $defaults, $args );

		$sort     = in_array( $a['sort'], array( 'hot', 'new', 'top' ), true ) ? $a['sort'] : 'hot';
		$page     = max( 1, (int) $a['page'] );
		$per_page = max( 1, min( 100, (int) $a['per_page'] ? (int) $a['per_page'] : 20 ) );
		$offset   = ( $page - 1 ) * $per_page;

		$where  = array( "p.post_type IN ('utlc_post','post')", "p.post_status = 'publish'" );
		$params = array();

		$board_sql = "SELECT 1 FROM {$wpdb->term_relationships} tr
			INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
			WHERE tr.object_id = p.ID AND tt.taxonomy = 'utlc_board'";
		if ( (int) $a['board_id'] ) {
			$board_sql .= ' AND tt.term_id = %d';
			$params[]   = (int) $a['board_id'];
		}
		$where[] = 'EXISTS (' . $board_sql . ')';

		if ( (int) $a['author_id'] ) {
			$where[]  = 'p.post_author = %d';
			$params[] = (int) $a['author_id'];
		}
		if ( '' !== trim( (string) $a['search'] ) ) {
			$like     = '%' . $wpdb->esc_like( trim( (string) $a['search'] ) ) . '%';
			$where[]  = '(p.post_title LIKE %s OR p.post_content LIKE %s)';
			$params[] = $like;
			$params[] = $like;
		}
		if ( '' !== (string) $a['kind'] ) {
			$where[]  = "EXISTS (SELECT 1 FROM {$wpdb->postmeta} km WHERE km.post_id = p.ID AND km.meta_key = '_utlc_kind' AND km.meta_value = %s)";
			$params[] = sanitize_key( $a['kind'] );
		}
		if ( 'top' === $sort ) {
			$spans = array(
				'day'   => DAY_IN_SECONDS,
				'week'  => WEEK_IN_SECONDS,
				'month' => 30 * DAY_IN_SECONDS,
				'year'  => YEAR_IN_SECONDS,
			);
			if ( isset( $spans[ $a['t'] ] ) ) {
				$where[]  = 'p.post_date_gmt >= %s';
				$params[] = gmdate( 'Y-m-d H:i:s', time() - $spans[ $a['t'] ] );
			}
		}

		$where_sql = implode( ' AND ', $where );

		$count_sql = "SELECT COUNT(*) FROM {$wpdb->posts} p WHERE {$where_sql}";
		$total     = (int) $wpdb->get_var( $params ? $wpdb->prepare( $count_sql, $params ) : $count_sql );

		$score_col = "(SELECT CAST(sm.meta_value AS SIGNED) FROM {$wpdb->postmeta} sm WHERE sm.post_id = p.ID AND sm.meta_key = '_utlc_score' LIMIT 1)";
		$hot_col   = "(SELECT CAST(hm.meta_value AS DECIMAL(20,7)) FROM {$wpdb->postmeta} hm WHERE hm.post_id = p.ID AND hm.meta_key = '_utlc_hot' LIMIT 1)";

		if ( 'new' === $sort ) {
			$order = 'p.post_date_gmt DESC, p.ID DESC';
		} elseif ( 'top' === $sort ) {
			$order = 'COALESCE(' . $score_col . ', 0) DESC, p.post_date_gmt DESC';
		} else {
			$order = 'COALESCE(' . $hot_col . ", TIMESTAMPDIFF(SECOND, '2005-12-08 07:46:43', p.post_date_gmt) / 45000) DESC, p.post_date_gmt DESC";
		}

		$sql      = "SELECT p.ID FROM {$wpdb->posts} p WHERE {$where_sql} ORDER BY {$order} LIMIT %d, %d";
		$qparams  = array_merge( $params, array( $offset, $per_page ) );
		$ids      = $wpdb->get_col( $wpdb->prepare( $sql, $qparams ) );
		$posts    = self::load_posts( $ids );

		return array(
			'posts' => $posts,
			'total' => $total,
			'pages' => (int) ceil( $total / $per_page ),
		);
	}

	public static function pinned( $board_id ) {
		global $wpdb;
		$board_id = (int) $board_id;
		$sql      = "SELECT p.ID FROM {$wpdb->posts} p
			WHERE p.post_type IN ('utlc_post','post') AND p.post_status = 'publish'
			AND EXISTS (SELECT 1 FROM {$wpdb->postmeta} pm WHERE pm.post_id = p.ID AND pm.meta_key = '_utlc_pinned' AND pm.meta_value = '1')";
		$params   = array();
		if ( $board_id ) {
			$sql     .= " AND EXISTS (SELECT 1 FROM {$wpdb->term_relationships} tr
				INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
				WHERE tr.object_id = p.ID AND tt.taxonomy = 'utlc_board' AND tt.term_id = %d)";
			$params[] = $board_id;
		}
		$sql .= ' ORDER BY p.post_date_gmt DESC LIMIT 10';
		$ids  = $wpdb->get_col( $params ? $wpdb->prepare( $sql, $params ) : $sql );
		return self::load_posts( $ids );
	}

	private static function load_posts( $ids ) {
		$ids = array_map( 'intval', (array) $ids );
		if ( empty( $ids ) ) {
			return array();
		}
		if ( function_exists( '_prime_post_caches' ) ) {
			_prime_post_caches( $ids, true, true );
		}
		$posts = array();
		foreach ( $ids as $id ) {
			$p = get_post( $id );
			if ( $p ) {
				$posts[] = $p;
			}
		}
		return $posts;
	}

	/* ------------------------------------------------------------------ */
	/* Votes                                                               */
	/* ------------------------------------------------------------------ */

	public static function hot( $score, $timestamp ) {
		$score   = (int) $score;
		$order   = log10( max( abs( $score ), 1 ) );
		$sign    = $score > 0 ? 1 : ( $score < 0 ? -1 : 0 );
		$seconds = (int) $timestamp - 1134028003;
		return round( $sign * $order + $seconds / 45000, 7 );
	}

	public static function user_votes( $user_id, $type, array $ids ) {
		global $wpdb;
		$user_id = (int) $user_id;
		$ids     = array_values( array_filter( array_map( 'intval', $ids ) ) );
		if ( ! $user_id || empty( $ids ) ) {
			return array();
		}
		$table        = $wpdb->prefix . 'utlc_votes';
		$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
		$params       = array_merge( array( $user_id, (string) $type ), $ids );
		$rows         = $wpdb->get_results(
			$wpdb->prepare( "SELECT object_id, value FROM {$table} WHERE user_id = %d AND object_type = %s AND object_id IN ({$placeholders})", $params )
		);
		$out = array();
		foreach ( (array) $rows as $r ) {
			$out[ (int) $r->object_id ] = (int) $r->value;
		}
		return $out;
	}

	public static function vote( $user_id, $type, $id, $value ) {
		global $wpdb;
		$user_id = (int) $user_id;
		$id      = (int) $id;
		$value   = (int) $value;
		$value   = $value > 0 ? 1 : ( $value < 0 ? -1 : 0 );

		if ( ! $user_id ) {
			return new WP_Error( 'utlc_login', '로그인이 필요합니다.' );
		}
		if ( ! in_array( $type, array( 'post', 'comment' ), true ) ) {
			return new WP_Error( 'utlc_type', '잘못된 요청입니다.' );
		}

		if ( 'post' === $type ) {
			$obj = get_post( $id );
			if ( ! $obj || ! in_array( $obj->post_type, array( 'utlc_post', 'post' ), true ) || 'publish' !== $obj->post_status ) {
				// Allow the author to auto-vote their own pending post.
				if ( ! $obj || 'utlc_post' !== $obj->post_type || (int) $obj->post_author !== $user_id ) {
					return new WP_Error( 'utlc_not_found', '글을 찾을 수 없습니다.' );
				}
			}
			$author_id = (int) $obj->post_author;
		} else {
			$obj = get_comment( $id );
			if ( ! $obj || '1' !== (string) $obj->comment_approved ) {
				return new WP_Error( 'utlc_not_found', '댓글을 찾을 수 없습니다.' );
			}
			$author_id = (int) $obj->user_id;
		}

		$table = $wpdb->prefix . 'utlc_votes';
		$old   = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT value FROM {$table} WHERE user_id = %d AND object_type = %s AND object_id = %d", $user_id, $type, $id )
		);

		if ( 0 === $value ) {
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE user_id = %d AND object_type = %s AND object_id = %d", $user_id, $type, $id ) );
		} else {
			$wpdb->query(
				$wpdb->prepare(
					"INSERT INTO {$table} (user_id, object_type, object_id, value, created_at) VALUES (%d, %s, %d, %d, %s)
					ON DUPLICATE KEY UPDATE value = VALUES(value), created_at = VALUES(created_at)",
					$user_id,
					$type,
					$id,
					$value,
					current_time( 'mysql', true )
				)
			);
		}

		$score = ( 'post' === $type ) ? self::refresh_post_score( $id ) : self::refresh_comment_score( $id );

		$delta = $value - $old;
		if ( $delta && $author_id && $author_id !== $user_id ) {
			$karma = (int) get_user_meta( $author_id, '_utlc_karma', true );
			update_user_meta( $author_id, '_utlc_karma', $karma + $delta );
		}

		return array(
			'score'     => (int) $score,
			'user_vote' => $value,
		);
	}

	public static function refresh_post_score( $post_id ) {
		global $wpdb;
		$post_id = (int) $post_id;
		$post    = get_post( $post_id );
		if ( ! $post ) {
			return 0;
		}
		$table = $wpdb->prefix . 'utlc_votes';
		$row   = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT COALESCE(SUM(CASE WHEN value > 0 THEN 1 ELSE 0 END),0) AS ups,
				COALESCE(SUM(CASE WHEN value < 0 THEN 1 ELSE 0 END),0) AS downs
				FROM {$table} WHERE object_type = %s AND object_id = %d",
				'post',
				$post_id
			)
		);
		$ups   = $row ? (int) $row->ups : 0;
		$downs = $row ? (int) $row->downs : 0;
		$score = $ups - $downs;
		$ts    = strtotime( $post->post_date_gmt . ' UTC' );
		if ( ! $ts || '0000-00-00 00:00:00' === $post->post_date_gmt ) {
			$ts = time();
		}
		update_post_meta( $post_id, '_utlc_ups', $ups );
		update_post_meta( $post_id, '_utlc_downs', $downs );
		update_post_meta( $post_id, '_utlc_score', $score );
		update_post_meta( $post_id, '_utlc_hot', self::hot( $score, $ts ) );
		return $score;
	}

	public static function refresh_comment_score( $comment_id ) {
		global $wpdb;
		$comment_id = (int) $comment_id;
		$table      = $wpdb->prefix . 'utlc_votes';
		$score      = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COALESCE(SUM(value),0) FROM {$table} WHERE object_type = %s AND object_id = %d", 'comment', $comment_id )
		);
		update_comment_meta( $comment_id, '_utlc_score', $score );
		return $score;
	}

	/* ------------------------------------------------------------------ */
	/* AJAX                                                                */
	/* ------------------------------------------------------------------ */

	public static function ajax_vote() {
		utlc_verify_ajax( true );
		$user_id = get_current_user_id();
		if ( utlc_rate_limited( 'vote_' . $user_id, 600, HOUR_IN_SECONDS ) ) {
			wp_send_json_error( array( 'message' => '잠시 후 다시 시도해 주세요.' ), 429 );
		}
		$type  = isset( $_POST['object_type'] ) ? sanitize_key( wp_unslash( $_POST['object_type'] ) ) : '';
		$id    = isset( $_POST['object_id'] ) ? absint( $_POST['object_id'] ) : 0;
		$value = isset( $_POST['value'] ) ? (int) $_POST['value'] : 0;
		$res   = self::vote( $user_id, $type, $id, $value );
		if ( is_wp_error( $res ) ) {
			wp_send_json_error( array( 'message' => $res->get_error_message() ), 400 );
		}
		wp_send_json_success( $res );
	}

	public static function ajax_join() {
		utlc_verify_ajax( true );
		$board_id = isset( $_POST['board_id'] ) ? absint( $_POST['board_id'] ) : 0;
		$term     = self::board( $board_id );
		if ( ! $term ) {
			wp_send_json_error( array( 'message' => '게시판을 찾을 수 없습니다.' ), 404 );
		}
		$join  = isset( $_POST['join'] ) && '0' !== (string) $_POST['join'] && 'false' !== (string) $_POST['join'];
		$count = self::set_member( get_current_user_id(), $term->term_id, $join );
		wp_send_json_success(
			array(
				'joined'       => $join,
				'member_count' => $count,
			)
		);
	}

	/* ------------------------------------------------------------------ */
	/* Legacy / blog post integration                                      */
	/* ------------------------------------------------------------------ */

	public static function transition_post_status( $new_status, $old_status, $post ) {
		if ( 'publish' !== $new_status || 'publish' === $old_status || ! $post ) {
			return;
		}
		if ( ! in_array( $post->post_type, array( 'post', 'utlc_post' ), true ) ) {
			return;
		}
		if ( ! taxonomy_exists( 'utlc_board' ) ) {
			return;
		}
		$has = wp_get_object_terms( $post->ID, 'utlc_board', array( 'fields' => 'ids' ) );
		if ( empty( $has ) || is_wp_error( $has ) ) {
			$board = ( 'post' === $post->post_type ) ? self::legacy_board_for( $post->ID ) : self::board( 'free' );
			if ( $board ) {
				wp_set_object_terms( $post->ID, array( (int) $board->term_id ), 'utlc_board', false );
			}
		}
		self::refresh_post_score( $post->ID );
	}

	public static function legacy_vote_bar( $content ) {
		if ( self::$in_vote_bar || is_admin() || is_feed() ) {
			return $content;
		}
		if ( ! utlc_opt( 'legacy_vote_bar' ) ) {
			return $content;
		}
		if ( ! is_singular( 'post' ) || ! in_the_loop() || ! is_main_query() || 'post' !== get_post_type() ) {
			return $content;
		}
		if ( doing_filter( 'get_the_excerpt' ) || doing_filter( 'wp_head' ) ) {
			return $content;
		}
		$tpl = locate_template( array( 'utlc-community/parts/vote.php' ) );
		if ( ! $tpl && ! file_exists( UTLC_DIR . 'templates/parts/vote.php' ) ) {
			return $content;
		}

		$post_id = get_the_ID();
		if ( ! $post_id ) {
			return $content;
		}
		self::$in_vote_bar = true;

		$score     = (int) get_post_meta( $post_id, '_utlc_score', true );
		$user_vote = 0;
		if ( is_user_logged_in() ) {
			$votes     = self::user_votes( get_current_user_id(), 'post', array( $post_id ) );
			$user_vote = isset( $votes[ $post_id ] ) ? (int) $votes[ $post_id ] : 0;
		}
		$board = self::post_board( $post_id );

		ob_start();
		utlc_get_template_part(
			'parts/vote',
			array(
				'type'       => 'post',
				'id'         => $post_id,
				'score'      => $score,
				'user_vote'  => $user_vote,
				'horizontal' => true,
			)
		);
		$bar = ob_get_clean();

		$html  = '<div class="utlc-app utlc-legacy-bar">';
		$html .= $bar;
		if ( $board ) {
			$html .= '<a class="utlc-btn utlc-btn--ghost utlc-btn--sm utlc-legacy-bar__link" href="' . esc_url( utlc_board_url( $board ) ) . '">'
				. esc_html( '커뮤니티 r/' . $board->slug . '에서 보기' ) . '</a>';
		}
		$html .= '</div>';

		self::$in_vote_bar = false;
		return $content . $html;
	}

	public static function legacy_redirects() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['utl_item'] ) ) {
			$id   = absint( $_GET['utl_item'] );
			$post = $id ? get_post( $id ) : null;
			if ( $post && 'utlc_post' === $post->post_type && 'publish' === $post->post_status ) {
				wp_safe_redirect( get_permalink( $post ), 301 );
				exit;
			}
		}
		if ( isset( $_GET['utl_community'] ) ) {
			$old   = sanitize_title( wp_unslash( $_GET['utl_community'] ) );
			$slug  = class_exists( 'UTLC_Install' ) ? UTLC_Install::map_legacy_slug( $old ) : 'free';
			$board = self::board( $slug );
			if ( $board ) {
				wp_safe_redirect( utlc_board_url( $board ), 301 );
				exit;
			}
		}
		// phpcs:enable
	}

	public static function show_admin_bar( $show ) {
		if ( ! is_admin() && is_user_logged_in() && ! current_user_can( 'edit_posts' ) ) {
			return false;
		}
		return $show;
	}
}
