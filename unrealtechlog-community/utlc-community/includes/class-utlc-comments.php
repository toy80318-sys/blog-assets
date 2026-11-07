<?php
/**
 * Reddit-style comment tree + AJAX add/delete.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Comments {

	const MAX_DEPTH = 8;

	public static function init() {
		add_action( 'wp_ajax_utlc_add_comment', array( __CLASS__, 'ajax_add' ) );
		add_action( 'wp_ajax_utlc_delete_comment', array( __CLASS__, 'ajax_delete' ) );
		add_action( 'utlc_enqueue_assets', array( __CLASS__, 'enqueue' ) );
	}

	public static function enqueue( $view = array() ) {
		wp_enqueue_script( 'utlc-comments', UTLC_URL . 'assets/js/utlc-comments.js', array( 'utlc' ), UTLC_VERSION, true );
	}

	private static function can_moderate( $uid, $post = null ) {
		$term = null;
		if ( $post && class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'post_board' ) ) {
			$term = UTLC_Core::post_board( $post );
		}
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'can_moderate' ) ) {
			return (bool) UTLC_Core::can_moderate( $uid, $term );
		}
		return user_can( $uid, 'moderate_comments' );
	}

	private static function time_ago( $gmt ) {
		if ( function_exists( 'utlc_time_ago' ) ) {
			return utlc_time_ago( $gmt );
		}
		return human_time_diff( strtotime( $gmt . ' UTC' ), time() ) . ' 전';
	}

	private static function avatar( $uid, $size = 24 ) {
		return function_exists( 'utlc_avatar' ) ? utlc_avatar( $uid, $size ) : '';
	}

	public static function body_html( $c ) {
		if ( 'md' === get_comment_meta( $c->comment_ID, '_utlc_format', true ) && class_exists( 'UTLC_Content' ) ) {
			return UTLC_Content::render( $c->comment_content );
		}
		return wpautop( make_clickable( wp_kses_post( $c->comment_content ) ) );
	}

	public static function vote_html( $type, $id, $score, $user_vote ) {
		$html = '';
		if ( function_exists( 'utlc_get_template_part' ) && file_exists( UTLC_DIR . 'templates/parts/vote.php' ) ) {
			ob_start();
			utlc_get_template_part(
				'parts/vote',
				array(
					'type'       => $type,
					'id'         => $id,
					'score'      => $score,
					'user_vote'  => $user_vote,
					'horizontal' => true,
				)
			);
			$html = trim( ob_get_clean() );
		}
		if ( '' === $html ) {
			$html = '<div class="utlc-vote utlc-vote--h' . ( $user_vote > 0 ? ' is-up' : ( $user_vote < 0 ? ' is-down' : '' ) ) . '" data-type="' . esc_attr( $type ) . '" data-id="' . esc_attr( $id ) . '">'
				. '<button type="button" class="utlc-vote__up' . ( $user_vote > 0 ? ' is-active' : '' ) . '" data-utlc-vote="1" aria-label="추천">▲</button>'
				. '<span class="utlc-vote__score">' . esc_html( (int) $score ) . '</span>'
				. '<button type="button" class="utlc-vote__down' . ( $user_vote < 0 ? ' is-active' : '' ) . '" data-utlc-vote="-1" aria-label="비추천">▼</button>'
				. '</div>';
		}
		return $html;
	}

	private static function sort_level( &$list ) {
		usort(
			$list,
			function ( $a, $b ) {
				$sa = (int) get_comment_meta( $a->comment_ID, '_utlc_score', true );
				$sb = (int) get_comment_meta( $b->comment_ID, '_utlc_score', true );
				if ( $sa === $sb ) {
					return strcmp( $a->comment_date_gmt, $b->comment_date_gmt );
				}
				return ( $sa > $sb ) ? -1 : 1;
			}
		);
	}

	public static function render( $post ) {
		$post = get_post( $post );
		if ( ! $post ) {
			return;
		}
		$uid      = get_current_user_id();
		$comments = get_comments(
			array(
				'post_id' => $post->ID,
				'status'  => 'approve',
				'type'    => 'comment',
				'orderby' => 'comment_date_gmt',
				'order'   => 'ASC',
			)
		);
		$children = array();
		$ids      = array();
		foreach ( $comments as $c ) {
			$children[ (int) $c->comment_parent ][] = $c;
			$ids[]                                  = (int) $c->comment_ID;
		}
		// Orphans (parent not approved) go to the top level.
		foreach ( $children as $pid => $list ) {
			if ( $pid && ! in_array( $pid, $ids, true ) ) {
				foreach ( $list as $c ) {
					$children[0][] = $c;
				}
				unset( $children[ $pid ] );
			}
		}
		foreach ( $children as $pid => $list ) {
			self::sort_level( $children[ $pid ] );
		}
		$votes = array();
		if ( $uid && $ids && class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'user_votes' ) ) {
			$votes = (array) UTLC_Core::user_votes( $uid, 'comment', $ids );
		}
		$ctx = array(
			'post'     => $post,
			'votes'    => $votes,
			'uid'      => $uid,
			'is_mod'   => $uid ? self::can_moderate( $uid, $post ) : false,
			'children' => $children,
		);
		$count = count( $comments );
		?>
		<section class="utlc-comments utlc-card" id="comments" data-post-id="<?php echo esc_attr( $post->ID ); ?>">
			<h2 class="utlc-comments__title">댓글 <span data-utlc-comment-count><?php echo esc_html( number_format_i18n( $count ) ); ?></span>개</h2>
			<?php
			if ( ! comments_open( $post ) ) {
				echo '<p class="utlc-muted">댓글이 닫혀 있습니다.</p>';
			} elseif ( ! $uid ) {
				$login = function_exists( 'utlc_login_url' ) ? utlc_login_url( get_permalink( $post ) . '#comments' ) : wp_login_url( get_permalink( $post ) );
				$join  = function_exists( 'utlc_join_url' ) ? utlc_join_url() : wp_registration_url();
				echo '<div class="utlc-alert utlc-alert--info utlc-comments__login">댓글을 쓰려면 <a href="' . esc_url( $login ) . '">로그인</a>하세요. 계정이 없나요? <a href="' . esc_url( $join ) . '">회원가입</a></div>';
			} elseif ( function_exists( 'utlc_is_banned' ) && utlc_is_banned( $uid ) ) {
				echo '<div class="utlc-alert utlc-alert--error">이용이 제한된 계정입니다.</div>';
			} else {
				echo self::form_html( $post->ID, 0 ); // phpcs:ignore
			}
			?>
			<div class="utlc-comments__list" data-utlc-comment-list>
				<?php
				if ( ! empty( $children[0] ) ) {
					foreach ( $children[0] as $c ) {
						echo self::comment_html( $c, 0, $ctx ); // phpcs:ignore
					}
				} else {
					echo '<p class="utlc-muted utlc-comments__empty" data-utlc-comments-empty>아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!</p>';
				}
				?>
			</div>
		</section>
		<?php
	}

	public static function form_html( $post_id, $parent ) {
		$ph = $parent ? '답글을 입력하세요' : '댓글을 입력하세요 (마크다운 일부 지원)';
		return '<form class="utlc-comment-form" data-post-id="' . esc_attr( $post_id ) . '" data-parent="' . esc_attr( $parent ) . '">'
			. '<textarea class="utlc-textarea" name="body" rows="3" maxlength="10000" required placeholder="' . esc_attr( $ph ) . '"></textarea>'
			. '<div class="utlc-comment-form__actions">'
			. ( $parent ? '<button type="button" class="utlc-btn utlc-btn--ghost utlc-btn--sm" data-utlc-reply-cancel>취소</button>' : '' )
			. '<button type="submit" class="utlc-btn utlc-btn--primary utlc-btn--sm">' . ( $parent ? '답글 달기' : '댓글 달기' ) . '</button>'
			. '</div></form>';
	}

	public static function comment_html( $c, $depth, $ctx ) {
		$post    = $ctx['post'];
		$cid     = (int) $c->comment_ID;
		$deleted = '1' === (string) get_comment_meta( $cid, '_utlc_deleted', true );
		$score   = (int) get_comment_meta( $cid, '_utlc_score', true );
		$uvote   = isset( $ctx['votes'][ $cid ] ) ? (int) $ctx['votes'][ $cid ] : 0;
		$auid    = (int) $c->user_id;
		$uid     = (int) $ctx['uid'];

		$h  = '<div class="utlc-comment' . ( $deleted ? ' is-deleted' : '' ) . '" id="comment-' . $cid . '" data-comment-id="' . $cid . '" data-depth="' . (int) $depth . '">';
		$h .= '<div class="utlc-comment__head">';
		$h .= '<button type="button" class="utlc-comment__collapse" data-utlc-collapse aria-label="접기/펼치기">[–]</button>';
		if ( $deleted ) {
			$h .= '<span class="utlc-muted">[삭제됨]</span>';
		} else {
			$h .= self::avatar( $auid, 24 );
			$name = $auid ? get_the_author_meta( 'display_name', $auid ) : $c->comment_author;
			if ( '' === (string) $name ) {
				$name = '익명';
			}
			if ( $auid && function_exists( 'utlc_user_url' ) ) {
				$h .= '<a class="utlc-comment__author" href="' . esc_url( utlc_user_url( $auid ) ) . '">' . esc_html( $name ) . '</a>';
			} else {
				$h .= '<span class="utlc-comment__author">' . esc_html( $name ) . '</span>';
			}
			if ( $auid && $auid === (int) $post->post_author ) {
				$h .= ' <span class="utlc-badge utlc-badge--op">작성자</span>';
			}
		}
		$h .= ' <span class="utlc-muted utlc-comment__time" title="' . esc_attr( $c->comment_date ) . '">· ' . esc_html( self::time_ago( $c->comment_date_gmt ) ) . '</span>';
		$h .= '</div>';

		$h .= '<div class="utlc-comment__content">';
		$h .= '<div class="utlc-comment__body">' . ( $deleted ? '<p class="utlc-muted">[삭제된 댓글입니다]</p>' : self::body_html( $c ) ) . '</div>';
		if ( ! $deleted ) {
			$h .= '<div class="utlc-comment__actions">';
			$h .= self::vote_html( 'comment', $cid, $score, $uvote );
			if ( comments_open( $post ) && $depth < self::MAX_DEPTH ) {
				$h .= '<button type="button" class="utlc-btn utlc-btn--ghost utlc-btn--sm" data-utlc-reply="' . $cid . '">💬 답글</button>';
			}
			$h .= '<button type="button" class="utlc-btn utlc-btn--ghost utlc-btn--sm" data-utlc-report="comment" data-type="comment" data-id="' . $cid . '" data-object-type="comment" data-object-id="' . $cid . '">신고</button>';
			if ( $uid && ( $uid === $auid || ! empty( $ctx['is_mod'] ) ) ) {
				$h .= '<button type="button" class="utlc-btn utlc-btn--ghost utlc-btn--sm" data-utlc-delete-comment="' . $cid . '">삭제</button>';
			}
			$h .= '</div>';
		}
		$h .= '<div class="utlc-comment__reply-slot" data-utlc-reply-slot></div>';
		$h .= '<div class="utlc-comment__children" data-utlc-children>';
		if ( ! empty( $ctx['children'][ $cid ] ) ) {
			foreach ( $ctx['children'][ $cid ] as $child ) {
				$h .= self::comment_html( $child, $depth + 1, $ctx );
			}
		}
		$h .= '</div></div></div>';
		return $h;
	}

	public static function render_user_comments( $user ) {
		$user = is_object( $user ) ? $user : get_userdata( (int) $user );
		if ( ! $user ) {
			return;
		}
		$paged    = isset( $_GET['pg'] ) ? max( 1, absint( $_GET['pg'] ) ) : 1; // phpcs:ignore
		$per      = 20;
		$comments = get_comments(
			array(
				'user_id'   => $user->ID,
				'status'    => 'approve',
				'type'      => 'comment',
				'post_type' => array( 'utlc_post', 'post' ),
				'number'    => $per + 1,
				'offset'    => ( $paged - 1 ) * $per,
				'orderby'   => 'comment_date_gmt',
				'order'     => 'DESC',
				'meta_query' => array(
					array(
						'key'     => '_utlc_deleted',
						'compare' => 'NOT EXISTS',
					),
				),
			)
		);
		$more     = count( $comments ) > $per;
		$comments = array_slice( $comments, 0, $per );
		if ( ! $comments ) {
			echo '<div class="utlc-card"><p class="utlc-muted">작성한 댓글이 없습니다.</p></div>';
			return;
		}
		echo '<div class="utlc-user-comments">';
		foreach ( $comments as $c ) {
			$p = get_post( $c->comment_post_ID );
			if ( ! $p || 'publish' !== $p->post_status ) {
				continue;
			}
			$link = get_permalink( $p ) . '#comment-' . (int) $c->comment_ID;
			echo '<article class="utlc-card utlc-user-comment">';
			echo '<div class="utlc-muted utlc-user-comment__meta"><a href="' . esc_url( $link ) . '">' . esc_html( wp_strip_all_tags( html_entity_decode( get_the_title( $p ), ENT_QUOTES, 'UTF-8' ) ) ) . '</a> · 점수 ' . esc_html( (int) get_comment_meta( $c->comment_ID, '_utlc_score', true ) ) . ' · ' . esc_html( self::time_ago( $c->comment_date_gmt ) ) . '</div>';
			echo '<div class="utlc-user-comment__body">' . self::body_html( $c ) . '</div>'; // phpcs:ignore
			echo '</article>';
		}
		echo '</div>';
		if ( $paged > 1 || $more ) {
			echo '<nav class="utlc-pagination">';
			if ( $paged > 1 ) {
				echo '<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="' . esc_url( add_query_arg( 'pg', $paged - 1 ) ) . '">이전</a> ';
			}
			if ( $more ) {
				echo '<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="' . esc_url( add_query_arg( 'pg', $paged + 1 ) ) . '">다음</a>';
			}
			echo '</nav>';
		}
	}

	/* ---------------- AJAX ---------------- */

	private static function verify() {
		if ( function_exists( 'utlc_verify_ajax' ) ) {
			utlc_verify_ajax( true );
			return;
		}
		if ( ! check_ajax_referer( 'utlc_nonce', 'nonce', false ) ) {
			wp_send_json_error( array( 'message' => '보안 토큰이 만료되었습니다.' ), 403 );
		}
		if ( ! is_user_logged_in() ) {
			wp_send_json_error( array( 'message' => '로그인이 필요합니다.' ), 401 );
		}
	}

	public static function ajax_add() {
		self::verify();
		$uid     = get_current_user_id();
		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$parent  = isset( $_POST['parent'] ) ? absint( $_POST['parent'] ) : 0;
		$body    = isset( $_POST['body'] ) ? (string) wp_unslash( $_POST['body'] ) : ''; // phpcs:ignore
		$body    = trim( wp_check_invalid_utf8( str_replace( array( "\r\n", "\r" ), "\n", $body ) ) );
		$len     = function_exists( 'mb_strlen' ) ? mb_strlen( $body, 'UTF-8' ) : strlen( $body );
		if ( $len < 1 ) {
			wp_send_json_error( array( 'message' => '내용을 입력해 주세요.' ), 400 );
		}
		if ( $len > 10000 ) {
			wp_send_json_error( array( 'message' => '댓글은 10,000자 이하로 입력해 주세요.' ), 400 );
		}
		$post = $post_id ? get_post( $post_id ) : null;
		if ( ! $post || 'publish' !== $post->post_status || ! comments_open( $post ) ) {
			wp_send_json_error( array( 'message' => '댓글을 달 수 없는 글입니다.' ), 400 );
		}
		if ( $parent ) {
			$pc = get_comment( $parent );
			if ( ! $pc || (int) $pc->comment_post_ID !== $post_id || '1' !== (string) $pc->comment_approved || '1' === (string) get_comment_meta( $parent, '_utlc_deleted', true ) ) {
				wp_send_json_error( array( 'message' => '답글을 달 수 없는 댓글입니다.' ), 400 );
			}
		}
		$is_mod = self::can_moderate( $uid, $post );
		if ( ! $is_mod && function_exists( 'utlc_rate_limited' ) ) {
			$max = function_exists( 'utlc_opt' ) ? (int) utlc_opt( 'comment_rate_per_hour' ) : 60;
			if ( utlc_rate_limited( 'comment_' . $uid, $max > 0 ? $max : 60, HOUR_IN_SECONDS ) ) {
				wp_send_json_error( array( 'message' => '댓글을 너무 자주 작성했습니다. 잠시 후 다시 시도해 주세요.' ), 429 );
			}
		}
		$user = wp_get_current_user();
		$data = array(
			'comment_post_ID'      => $post_id,
			'comment_parent'       => $parent,
			'user_id'              => $uid,
			'comment_author'       => $user->display_name,
			'comment_author_email' => $user->user_email,
			'comment_author_url'   => '',
			'comment_author_IP'    => function_exists( 'utlc_client_ip' ) ? utlc_client_ip() : '',
			'comment_agent'        => isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 254 ) : '',
			'comment_content'      => $body,
			'comment_type'         => 'comment',
			'comment_approved'     => 1,
			'comment_date'         => current_time( 'mysql' ),
			'comment_date_gmt'     => current_time( 'mysql', 1 ),
		);
		$had_kses = false !== has_filter( 'pre_comment_content', 'wp_filter_kses' ) || false !== has_filter( 'pre_comment_content', 'wp_filter_post_kses' );
		kses_remove_filters();
		$cid = wp_insert_comment( $data );
		if ( $had_kses ) {
			kses_init_filters();
		}
		if ( ! $cid ) {
			wp_send_json_error( array( 'message' => '댓글을 저장하지 못했습니다.' ), 500 );
		}
		add_comment_meta( $cid, '_utlc_format', 'md', true );
		add_comment_meta( $cid, '_utlc_score', 0, true );
		if ( function_exists( 'wp_new_comment_notify_postauthor' ) ) {
			wp_new_comment_notify_postauthor( $cid );
		}
		$c   = get_comment( $cid );
		$ctx = array(
			'post'     => $post,
			'votes'    => array(),
			'uid'      => $uid,
			'is_mod'   => $is_mod,
			'children' => array(),
		);
		$depth = 0;
		$p     = $parent;
		while ( $p && $depth < 50 ) {
			$depth++;
			$pc = get_comment( $p );
			$p  = $pc ? (int) $pc->comment_parent : 0;
		}
		wp_send_json_success(
			array(
				'html' => self::comment_html( $c, $depth, $ctx ),
				'id'   => (int) $cid,
			)
		);
	}

	public static function ajax_delete() {
		self::verify();
		$uid = get_current_user_id();
		$cid = isset( $_POST['comment_id'] ) ? absint( $_POST['comment_id'] ) : 0;
		$c   = $cid ? get_comment( $cid ) : null;
		if ( ! $c ) {
			wp_send_json_error( array( 'message' => '댓글을 찾을 수 없습니다.' ), 404 );
		}
		$post = get_post( $c->comment_post_ID );
		if ( (int) $c->user_id !== $uid && ! self::can_moderate( $uid, $post ) ) {
			wp_send_json_error( array( 'message' => '삭제 권한이 없습니다.' ), 403 );
		}
		$has_children = (int) get_comments(
			array(
				'parent' => $cid,
				'count'  => true,
				'status' => 'approve',
			)
		) > 0;
		if ( $has_children ) {
			update_comment_meta( $cid, '_utlc_deleted', '1' );
			$soft = true;
		} else {
			wp_trash_comment( $cid );
			$soft = false;
		}
		wp_send_json_success(
			array(
				'soft'    => $soft,
				'message' => '댓글이 삭제되었습니다.',
			)
		);
	}
}
