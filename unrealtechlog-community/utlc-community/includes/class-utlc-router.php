<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Routing, templates, titles/robots, assets.
 */
class UTLC_Router {

	protected static $view  = null;
	protected static $flash = null;

	public static function init() {
		add_action( 'init', array( __CLASS__, 'add_rewrite_rules' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'template_redirect' ), 5 );
		add_filter( 'template_include', array( __CLASS__, 'template_include' ), 99 );
		add_filter( 'pre_handle_404', array( __CLASS__, 'pre_handle_404' ), 10, 2 );
		add_filter( 'redirect_canonical', array( __CLASS__, 'redirect_canonical' ), 10, 2 );
		add_filter( 'pre_get_document_title', array( __CLASS__, 'document_title' ), 99 );
		add_filter( 'wpseo_title', array( __CLASS__, 'seo_title' ), 99 );
		add_filter( 'rank_math/frontend/title', array( __CLASS__, 'seo_title' ), 99 );
		add_filter( 'wp_robots', array( __CLASS__, 'wp_robots' ), 99 );
		add_filter( 'wpseo_robots', array( __CLASS__, 'wpseo_robots' ), 99 );
		add_filter( 'rank_math/frontend/robots', array( __CLASS__, 'rank_math_robots' ), 99 );
		add_filter( 'body_class', array( __CLASS__, 'body_class' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 20 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'dequeue_theme_styles' ), 9999 );
		add_action( 'wp_print_styles', array( __CLASS__, 'dequeue_theme_styles' ), 9999 );
		add_filter( 'show_admin_bar', array( __CLASS__, 'show_admin_bar' ) );
		add_action( 'wp_login_failed', array( __CLASS__, 'login_failed' ) );
	}

	/** Send failed logins from our /login/ page back to it (wp_login_form posts to wp-login.php). */
	public static function login_failed() {
		$ref = wp_get_referer();
		if ( $ref && false !== strpos( $ref, home_url( '/login/' ) ) ) {
			wp_safe_redirect( add_query_arg( 'login', 'failed', remove_query_arg( 'login', $ref ) ) );
			exit;
		}
	}

	/* ---------------- Rewrites ---------------- */

	public static function add_rewrite_rules() {
		add_rewrite_rule( '^r/([^/]+)/comments/([0-9]+)(?:/[^/]*)?/?$', 'index.php?post_type=utlc_post&p=$matches[2]', 'top' );
		add_rewrite_rule( '^r/([^/]+)/submit/?$', 'index.php?utlc_route=submit&utlc_board_slug=$matches[1]', 'top' );
		add_rewrite_rule( '^submit/?$', 'index.php?utlc_route=submit', 'top' );
		add_rewrite_rule( '^communities/?$', 'index.php?utlc_route=communities', 'top' );
		add_rewrite_rule( '^community/?$', 'index.php?utlc_route=home', 'top' );
		add_rewrite_rule( '^login/?$', 'index.php?utlc_route=login', 'top' );
		add_rewrite_rule( '^join/?$', 'index.php?utlc_route=join', 'top' );
		add_rewrite_rule( '^u/([^/]+)/?$', 'index.php?utlc_route=profile&utlc_user=$matches[1]', 'top' );
		add_rewrite_rule( '^checkout/([A-Za-z0-9_-]+)/?$', 'index.php?utlc_route=order&utlc_order=$matches[1]', 'top' );
		add_rewrite_rule( '^utlc-pay/([a-z0-9_]+)/(success|fail)/?$', 'index.php?utlc_route=pay&utlc_gateway=$matches[1]&utlc_result=$matches[2]', 'top' );
		add_rewrite_rule( '^utlc-download/([0-9]+)/?$', 'index.php?utlc_route=download&utlc_item=$matches[1]', 'top' );
	}

	public static function query_vars( $vars ) {
		return array_merge( $vars, array( 'utlc_route', 'utlc_board_slug', 'utlc_user', 'utlc_order', 'utlc_gateway', 'utlc_result', 'utlc_item' ) );
	}

	/* ---------------- View context ---------------- */

	public static function view() {
		if ( null !== self::$view ) {
			return self::$view;
		}
		$v = array(
			'route'     => '',
			'template'  => '',
			'board'     => null,
			'post'      => null,
			'user'      => null,
			'edit_post' => null,
			'sort'      => 'hot',
			't'         => 'all',
			'pg'        => 1,
			'q'         => '',
			'tab'       => 'posts',
			'noindex'   => false,
			'title'     => '',
		);

		$sort = isset( $_GET['sort'] ) ? sanitize_key( wp_unslash( $_GET['sort'] ) ) : '';
		if ( in_array( $sort, array( 'hot', 'new', 'top' ), true ) ) {
			$v['sort'] = $sort;
		}
		$t = isset( $_GET['t'] ) ? sanitize_key( wp_unslash( $_GET['t'] ) ) : '';
		if ( in_array( $t, array( 'day', 'week', 'month', 'year', 'all' ), true ) ) {
			$v['t'] = $t;
		}
		$v['pg'] = isset( $_GET['pg'] ) ? max( 1, absint( $_GET['pg'] ) ) : 1;
		$v['q']  = isset( $_GET['q'] ) ? trim( sanitize_text_field( wp_unslash( $_GET['q'] ) ) ) : '';

		$route = sanitize_key( (string) get_query_var( 'utlc_route' ) );
		$has_core = class_exists( 'UTLC_Core' );

		if ( '' !== $route ) {
			switch ( $route ) {
				case 'home':
				case 'communities':
				case 'login':
				case 'join':
				case 'order':
				case 'download':
				case 'pay':
					$v['route'] = $route;
					break;
				case 'submit':
					$v['route'] = 'submit';
					$slug       = (string) get_query_var( 'utlc_board_slug' );
					if ( '' !== $slug && $has_core && method_exists( 'UTLC_Core', 'board' ) ) {
						$v['board'] = UTLC_Core::board( sanitize_title( $slug ) );
						if ( ! $v['board'] ) {
							$v['route'] = 'notfound';
						}
					}
					if ( isset( $_GET['edit'] ) ) {
						$ep = get_post( absint( $_GET['edit'] ) );
						if ( $ep && in_array( $ep->post_type, array( 'utlc_post' ), true ) && self::can_manage_post( $ep ) ) {
							$v['edit_post'] = $ep;
							if ( ! $v['board'] && $has_core && method_exists( 'UTLC_Core', 'post_board' ) ) {
								$v['board'] = UTLC_Core::post_board( $ep );
							}
						}
					}
					break;
				case 'profile':
					$user = get_user_by( 'slug', sanitize_title( (string) get_query_var( 'utlc_user' ) ) );
					if ( $user ) {
						$v['route'] = 'profile';
						$v['user']  = $user;
						$tab        = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'posts';
						$allowed    = array( 'posts', 'comments', 'listings' );
						if ( is_user_logged_in() && get_current_user_id() === (int) $user->ID ) {
							$allowed[] = 'purchases';
							$allowed[] = 'sales';
						}
						$v['tab'] = in_array( $tab, $allowed, true ) ? $tab : 'posts';
					} else {
						$v['route'] = 'notfound';
					}
					break;
				default:
					$v['route'] = 'notfound';
			}
		} elseif ( is_tax( 'utlc_board' ) ) {
			$v['route'] = 'board';
			$v['board'] = get_queried_object();
		} elseif ( is_singular( 'utlc_post' ) ) {
			$v['route'] = 'single';
			$v['post']  = get_queried_object();
			if ( $has_core && method_exists( 'UTLC_Core', 'post_board' ) && $v['post'] ) {
				$v['board'] = UTLC_Core::post_board( $v['post'] );
			}
		} elseif ( self::opt( 'front_page', 1 ) && is_front_page() && ! is_search() ) {
			$v['route'] = 'home';
		}

		if ( ! in_array( $v['route'], array( '', 'download', 'pay' ), true ) ) {
			$v['template'] = $v['route'];
		}

		$v['noindex'] = in_array( $v['route'], array( 'submit', 'login', 'join', 'order', 'notfound' ), true )
			|| ( 'profile' === $v['route'] && in_array( $v['tab'], array( 'purchases', 'sales' ), true ) )
			|| ( '' !== $v['route'] && '' !== $v['q'] );

		$v['title'] = self::compute_title( $v );

		if ( did_action( 'wp' ) ) {
			self::$view = $v;
		}
		return $v;
	}

	protected static function compute_title( $v ) {
		$name = (string) self::opt( 'community_name', '커뮤니티' );
		switch ( $v['route'] ) {
			case 'home':
				return '' !== $v['q'] ? sprintf( '"%s" 검색 결과', $v['q'] ) : $name;
			case 'board':
				return $v['board'] ? $v['board']->name . ' (r/' . $v['board']->slug . ')' : $name;
			case 'submit':
				return $v['edit_post'] ? '글 수정' : ( $v['board'] ? '글쓰기 - r/' . $v['board']->slug : '글쓰기' );
			case 'communities':
				return '게시판 목록';
			case 'profile':
				return $v['user'] ? $v['user']->display_name . ' (u/' . $v['user']->user_nicename . ')' : '프로필';
			case 'login':
				return '로그인';
			case 'join':
				return '회원가입';
			case 'order':
				return '주문 정보';
			case 'notfound':
				return '페이지를 찾을 수 없습니다';
		}
		return '';
	}

	public static function is_ours() {
		$v = self::view();
		return '' !== $v['route'];
	}

	public static function flash() {
		if ( null === self::$flash && function_exists( 'utlc_flash_get' ) && ! headers_sent() ) {
			self::$flash = utlc_flash_get();
			if ( null === self::$flash ) {
				self::$flash = false;
			}
		}
		return self::$flash ? self::$flash : null;
	}

	/* ---------------- Request handling ---------------- */

	public static function template_redirect() {
		$v = self::view();
		switch ( $v['route'] ) {
			case 'download':
				if ( class_exists( 'UTLC_Market' ) && method_exists( 'UTLC_Market', 'handle_download' ) ) {
					UTLC_Market::handle_download( absint( get_query_var( 'utlc_item' ) ) );
				}
				wp_die( esc_html__( '다운로드를 처리할 수 없습니다.', 'utlc' ), '', array( 'response' => 404 ) );
				break;
			case 'pay':
				if ( class_exists( 'UTLC_Orders' ) && method_exists( 'UTLC_Orders', 'handle_return' ) ) {
					UTLC_Orders::handle_return( sanitize_key( get_query_var( 'utlc_gateway' ) ), sanitize_key( get_query_var( 'utlc_result' ) ) );
				}
				wp_die( esc_html__( '결제 결과를 처리할 수 없습니다.', 'utlc' ), '', array( 'response' => 400 ) );
				break;
			case 'submit':
			case 'order':
				if ( ! is_user_logged_in() ) {
					wp_safe_redirect( self::login_url( self::current_url() ) );
					exit;
				}
				break;
			case 'login':
			case 'join':
				if ( is_user_logged_in() ) {
					$to = isset( $_GET['redirect_to'] ) ? wp_validate_redirect( esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ), self::community_url() ) : self::community_url();
					wp_safe_redirect( $to );
					exit;
				}
				break;
			case 'notfound':
				status_header( 404 );
				nocache_headers();
				break;
		}
		if ( in_array( $v['route'], array( 'submit', 'login', 'join', 'order', 'download', 'pay' ), true ) || ( 'profile' === $v['route'] && in_array( $v['tab'], array( 'purchases', 'sales' ), true ) ) ) {
			// Page caches (WP Super Cache, W3TC, LiteSpeed) must never store these per-user pages.
			if ( ! defined( 'DONOTCACHEPAGE' ) ) {
				define( 'DONOTCACHEPAGE', true );
			}
		}
		if ( '' !== $v['route'] ) {
			// Board icons are emoji: keep them as native text instead of wp-emoji <img> replacements.
			remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
			remove_action( 'wp_print_styles', 'print_emoji_styles' );
			self::flash();
			if ( in_array( $v['route'], array( 'submit', 'login', 'join', 'order' ), true ) ) {
				nocache_headers();
			}
		}
	}

	public static function template_include( $template ) {
		$v = self::view();
		if ( '' === $v['template'] ) {
			return $template;
		}
		$theme = locate_template( array( 'utlc-community/layout.php' ) );
		return $theme ? $theme : UTLC_DIR . 'templates/layout.php';
	}

	public static function pre_handle_404( $preempt, $wp_query ) {
		if ( ! $wp_query->is_main_query() ) {
			return $preempt;
		}
		$route = (string) get_query_var( 'utlc_route' );
		if ( in_array( $route, array( 'home', 'communities', 'login', 'join', 'order', 'submit', 'download', 'pay' ), true ) ) {
			status_header( 200 );
			return true;
		}
		if ( 'profile' === $route && get_user_by( 'slug', sanitize_title( (string) get_query_var( 'utlc_user' ) ) ) ) {
			status_header( 200 );
			return true;
		}
		if ( $wp_query->is_tax( 'utlc_board' ) && $wp_query->get_queried_object() ) {
			status_header( 200 );
			return true;
		}
		return $preempt;
	}

	public static function redirect_canonical( $redirect, $requested ) {
		if ( get_query_var( 'utlc_route' ) ) {
			return false;
		}
		return $redirect;
	}

	/**
	 * Render a template part (theme override aware) with $view available.
	 */
	public static function render( $template, $args = array() ) {
		$template = preg_replace( '#[^a-z0-9_/-]#', '', (string) $template );
		if ( '' === $template ) {
			return;
		}
		if ( ! isset( $args['view'] ) ) {
			$args['view'] = self::view();
		}
		if ( function_exists( 'utlc_get_template_part' ) ) {
			utlc_get_template_part( $template, $args );
			return;
		}
		$file = UTLC_DIR . 'templates/' . $template . '.php';
		if ( file_exists( $file ) ) {
			extract( $args, EXTR_SKIP ); // phpcs:ignore
			include $file;
		}
	}

	/* ---------------- Titles / robots ---------------- */

	protected static function full_title() {
		$v = self::view();
		if ( '' === $v['title'] ) {
			return '';
		}
		return $v['title'] . ' - ' . get_bloginfo( 'name' );
	}

	public static function document_title( $title ) {
		$t = self::full_title();
		return '' !== $t ? $t : $title;
	}

	public static function seo_title( $title ) {
		$t = self::full_title();
		return '' !== $t ? $t : $title;
	}

	public static function wp_robots( $robots ) {
		$v = self::view();
		if ( $v['noindex'] ) {
			$robots['noindex']  = true;
			$robots['nofollow'] = true;
			unset( $robots['index'], $robots['follow'], $robots['max-image-preview'] );
		}
		return $robots;
	}

	public static function wpseo_robots( $robots ) {
		$v = self::view();
		return $v['noindex'] ? 'noindex,nofollow' : $robots;
	}

	public static function rank_math_robots( $robots ) {
		$v = self::view();
		if ( $v['noindex'] ) {
			$robots           = is_array( $robots ) ? $robots : array();
			$robots['index']  = 'noindex';
			$robots['follow'] = 'nofollow';
		}
		return $robots;
	}

	public static function body_class( $classes ) {
		$v = self::view();
		if ( '' !== $v['route'] ) {
			$classes[] = 'utlc-body';
			$classes[] = 'utlc-route-' . sanitize_html_class( $v['route'] );
		}
		return $classes;
	}

	public static function show_admin_bar( $show ) {
		if ( is_user_logged_in() && ! current_user_can( 'edit_posts' ) ) {
			return false;
		}
		return $show;
	}

	/* ---------------- Assets ---------------- */

	public static function enqueue() {
		$v = self::view();
		if ( '' === $v['route'] && ! is_singular( 'post' ) ) {
			return;
		}
		$ver = defined( 'UTLC_VERSION' ) ? UTLC_VERSION : '1.0.0';
		wp_enqueue_style( 'utlc-pretendard', 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css', array(), null );
		wp_enqueue_style( 'utlc', UTLC_URL . 'assets/css/utlc.css', array( 'utlc-pretendard' ), $ver );
		wp_enqueue_script( 'utlc', UTLC_URL . 'assets/js/utlc.js', array(), $ver, true );
		wp_localize_script(
			'utlc',
			'utlcData',
			array(
				'ajaxUrl'      => admin_url( 'admin-ajax.php' ),
				'nonce'        => wp_create_nonce( 'utlc_nonce' ),
				'loggedIn'     => is_user_logged_in(),
				'loginUrl'     => self::login_url( self::current_url() ),
				'joinUrl'      => function_exists( 'utlc_join_url' ) ? utlc_join_url() : home_url( '/join/' ),
				'userId'       => get_current_user_id(),
				'communityUrl' => self::community_url(),
				'route'        => $v['route'],
			)
		);
		do_action( 'utlc_enqueue_assets', $v );
	}

	public static function dequeue_theme_styles() {
		$v = self::view();
		if ( '' === $v['route'] ) {
			return;
		}
		$styles = wp_styles();
		$dirs   = array_unique( array( get_template_directory_uri(), get_stylesheet_directory_uri() ) );
		foreach ( (array) $styles->queue as $handle ) {
			if ( empty( $styles->registered[ $handle ] ) ) {
				continue;
			}
			$src = (string) $styles->registered[ $handle ]->src;
			foreach ( $dirs as $dir ) {
				if ( '' !== $dir && false !== strpos( $src, $dir ) ) {
					wp_dequeue_style( $handle );
					break;
				}
			}
		}
	}

	/* ---------------- Utilities ---------------- */

	public static function current_url() {
		$host = isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) : wp_parse_url( home_url(), PHP_URL_HOST );
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
		return esc_url_raw( ( is_ssl() ? 'https://' : 'http://' ) . $host . $uri );
	}

	public static function login_url( $redirect = '' ) {
		if ( function_exists( 'utlc_login_url' ) ) {
			return utlc_login_url( $redirect );
		}
		return add_query_arg( 'redirect_to', rawurlencode( $redirect ), home_url( '/login/' ) );
	}

	public static function community_url() {
		return function_exists( 'utlc_community_url' ) ? utlc_community_url() : home_url( '/community/' );
	}

	public static function opt( $key, $default = null ) {
		if ( function_exists( 'utlc_opt' ) ) {
			$val = utlc_opt( $key );
			return null === $val ? $default : $val;
		}
		return $default;
	}

	public static function can_manage_post( $post ) {
		$post = get_post( $post );
		if ( ! $post || ! is_user_logged_in() ) {
			return false;
		}
		$uid = get_current_user_id();
		if ( (int) $post->post_author === $uid ) {
			return true;
		}
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'can_moderate' ) ) {
			$board = method_exists( 'UTLC_Core', 'post_board' ) ? UTLC_Core::post_board( $post ) : null;
			return (bool) UTLC_Core::can_moderate( $uid, $board );
		}
		return current_user_can( 'moderate_comments' );
	}

	/** URL with feed params (sort/t/q) merged, pg removed unless given. */
	public static function feed_url( $base, $args = array() ) {
		$v      = self::view();
		$params = array();
		if ( 'hot' !== $v['sort'] ) {
			$params['sort'] = $v['sort'];
		}
		if ( 'top' === $v['sort'] && 'all' !== $v['t'] ) {
			$params['t'] = $v['t'];
		}
		if ( '' !== $v['q'] ) {
			$params['q'] = $v['q'];
		}
		$params = array_merge( $params, $args );
		foreach ( $params as $k => $val ) {
			if ( null === $val || '' === $val || ( 'sort' === $k && 'hot' === $val ) || ( 'pg' === $k && (int) $val <= 1 ) ) {
				unset( $params[ $k ] );
			}
		}
		if ( isset( $params['sort'] ) && 'top' !== $params['sort'] ) {
			unset( $params['t'] );
		}
		return add_query_arg( array_map( 'rawurlencode', $params ), $base );
	}
}
