<?php
/**
 * Post create / edit / delete + submit form.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Submit {

	public static function init() {
		add_action( 'admin_post_utlc_submit_post', array( __CLASS__, 'handle_submit' ) );
		add_action( 'admin_post_nopriv_utlc_submit_post', array( __CLASS__, 'handle_nopriv' ) );
		add_action( 'wp_ajax_utlc_delete_post', array( __CLASS__, 'ajax_delete_post' ) );
		add_action( 'wp_ajax_utlc_pin', array( __CLASS__, 'ajax_pin' ) );
		add_action( 'utlc_enqueue_assets', array( __CLASS__, 'enqueue' ) );
	}

	public static function enqueue( $view = array() ) {
		wp_enqueue_script( 'utlc-submit', UTLC_URL . 'assets/js/utlc-submit.js', array( 'utlc' ), UTLC_VERSION, true );
	}

	private static function opt( $key, $default ) {
		if ( function_exists( 'utlc_opt' ) ) {
			$v = utlc_opt( $key );
			if ( null !== $v && '' !== $v ) {
				return $v;
			}
		}
		return $default;
	}

	private static function board_type( $term ) {
		if ( ! $term ) {
			return 'general';
		}
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'board_meta' ) ) {
			return (string) UTLC_Core::board_meta( $term, 'utlc_type' );
		}
		$t = get_term_meta( $term->term_id, 'utlc_type', true );
		return $t ? $t : 'general';
	}

	private static function flairs( $term ) {
		if ( $term && class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'flairs' ) ) {
			return (array) UTLC_Core::flairs( $term );
		}
		return array();
	}

	private static function can_post( $uid, $term ) {
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'can_post' ) ) {
			return (bool) UTLC_Core::can_post( $uid, $term );
		}
		return $uid > 0;
	}

	private static function can_moderate( $uid, $term = null ) {
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'can_moderate' ) ) {
			return (bool) UTLC_Core::can_moderate( $uid, $term );
		}
		return user_can( $uid, 'moderate_comments' );
	}

	private static function post_board( $post ) {
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'post_board' ) ) {
			return UTLC_Core::post_board( $post );
		}
		$terms = get_the_terms( $post, 'utlc_board' );
		return ( $terms && ! is_wp_error( $terms ) ) ? $terms[0] : null;
	}

	private static function get_board( $id ) {
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'board' ) ) {
			return UTLC_Core::board( $id );
		}
		$t = get_term( (int) $id, 'utlc_board' );
		return ( $t && ! is_wp_error( $t ) ) ? $t : null;
	}

	private static function boards() {
		if ( class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'boards' ) ) {
			return (array) UTLC_Core::boards();
		}
		$t = get_terms( array( 'taxonomy' => 'utlc_board', 'hide_empty' => false ) );
		return is_wp_error( $t ) ? array() : $t;
	}

	/* ---------------- form ---------------- */

	public static function render_form( $board = null, $edit_post = null ) {
		$uid = get_current_user_id();
		if ( ! $uid ) {
			$login = function_exists( 'utlc_login_url' ) ? utlc_login_url( isset( $_SERVER['REQUEST_URI'] ) ? home_url( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '' ) : wp_login_url();
			echo '<div class="utlc-card utlc-alert utlc-alert--info">글을 쓰려면 <a href="' . esc_url( $login ) . '">로그인</a>이 필요합니다.</div>';
			return;
		}
		if ( function_exists( 'utlc_is_banned' ) && utlc_is_banned( $uid ) ) {
			echo '<div class="utlc-alert utlc-alert--error">이용이 제한된 계정입니다.</div>';
			return;
		}

		$edit_post = $edit_post ? get_post( $edit_post ) : null;
		if ( $edit_post ) {
			if ( 'utlc_post' !== $edit_post->post_type || ( (int) $edit_post->post_author !== $uid && ! self::can_moderate( $uid, self::post_board( $edit_post ) ) ) ) {
				echo '<div class="utlc-alert utlc-alert--error">이 글을 수정할 권한이 없습니다.</div>';
				return;
			}
			$board = self::post_board( $edit_post );
		}

		$boards = array();
		foreach ( self::boards() as $b ) {
			if ( self::can_post( $uid, $b ) || ( $board && (int) $b->term_id === (int) $board->term_id && $edit_post ) ) {
				$boards[] = $b;
			}
		}
		if ( ! $boards ) {
			echo '<div class="utlc-alert utlc-alert--error">글을 쓸 수 있는 게시판이 없습니다.</div>';
			return;
		}
		if ( ! $board ) {
			$board = $boards[0];
		}

		$type = self::board_type( $board );
		$kind = $edit_post ? get_post_meta( $edit_post->ID, '_utlc_kind', true ) : '';
		if ( 'market' === $type ) {
			$kind = 'model';
		} elseif ( ! in_array( $kind, array( 'text', 'image', 'link' ), true ) ) {
			$kind = 'text';
		}
		$title   = $edit_post ? html_entity_decode( $edit_post->post_title, ENT_QUOTES, 'UTF-8' ) : '';
		$body    = $edit_post ? $edit_post->post_content : '';
		$url     = $edit_post ? get_post_meta( $edit_post->ID, '_utlc_url', true ) : '';
		$flair   = $edit_post ? get_post_meta( $edit_post->ID, '_utlc_flair', true ) : '';
		$images  = $edit_post ? array_filter( array_map( 'absint', (array) get_post_meta( $edit_post->ID, '_utlc_images', true ) ) ) : array();
		$max_img = (int) self::opt( 'images_per_post', 10 );
		$max_mb  = (int) self::opt( 'image_max_mb', 10 );
		$kinds   = array(
			'text'  => '📝 글',
			'image' => '🖼️ 이미지',
			'link'  => '🔗 링크',
			'model' => '🧊 3D 모델',
		);
		?>
		<div class="utlc-card utlc-submit">
			<h1 class="utlc-submit__title"><?php echo $edit_post ? '글 수정' : '글쓰기'; ?></h1>
			<form class="utlc-submit-form" method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-max-images="<?php echo esc_attr( $max_img ); ?>" data-max-mb="<?php echo esc_attr( $max_mb ); ?>">
				<input type="hidden" name="action" value="utlc_submit_post">
				<input type="hidden" name="utlc_edit" value="<?php echo esc_attr( $edit_post ? $edit_post->ID : 0 ); ?>">
				<input type="hidden" name="utlc_kind" value="<?php echo esc_attr( $kind ); ?>" data-utlc-kind-input>
				<?php wp_nonce_field( 'utlc_submit', 'utlc_submit_nonce' ); ?>
				<div style="position:absolute;left:-9999px;top:-9999px" aria-hidden="true">
					<label>비워 두세요 <input type="text" name="utlc_hp" value="" tabindex="-1" autocomplete="off"></label>
				</div>

				<div class="utlc-field">
					<label for="utlc_board">게시판</label>
					<select class="utlc-select" id="utlc_board" name="utlc_board" data-utlc-board-select>
						<?php foreach ( $boards as $b ) : ?>
							<option value="<?php echo esc_attr( $b->term_id ); ?>" data-type="<?php echo esc_attr( self::board_type( $b ) ); ?>" data-flairs="<?php echo esc_attr( wp_json_encode( array_values( self::flairs( $b ) ) ) ); ?>" <?php selected( (int) $b->term_id, (int) $board->term_id ); ?>>r/<?php echo esc_html( $b->slug . ' · ' . $b->name ); ?></option>
						<?php endforeach; ?>
					</select>
				</div>

				<div class="utlc-tabs" role="tablist">
					<?php foreach ( $kinds as $k => $label ) :
						$hidden = ( 'market' === $type ) ? ( 'model' !== $k ) : ( 'model' === $k );
						?>
						<button type="button" class="utlc-tab<?php echo $k === $kind ? ' is-active' : ''; ?>" data-utlc-kind="<?php echo esc_attr( $k ); ?>"<?php echo $hidden ? ' hidden' : ''; ?>><?php echo esc_html( $label ); ?></button>
					<?php endforeach; ?>
				</div>

				<div class="utlc-field">
					<label for="utlc_title">제목 <span class="utlc-muted">(2~300자)</span></label>
					<input class="utlc-input" type="text" id="utlc_title" name="utlc_title" maxlength="300" required value="<?php echo esc_attr( $title ); ?>">
				</div>

				<div class="utlc-field" data-utlc-panel="link"<?php echo 'link' === $kind ? '' : ' hidden'; ?>>
					<label for="utlc_url">링크 URL</label>
					<input class="utlc-input" type="url" id="utlc_url" name="utlc_url" placeholder="https://" value="<?php echo esc_attr( $url ); ?>">
				</div>

				<div class="utlc-field">
					<label for="utlc_body">본문 <span class="utlc-muted">(선택 · 마크다운 일부 지원: **굵게**, *기울임*, `코드`, &gt; 인용, - 목록)</span></label>
					<textarea class="utlc-textarea" id="utlc_body" name="utlc_body" rows="10" maxlength="40000"><?php echo esc_textarea( $body ); ?></textarea>
				</div>

				<div class="utlc-field" data-utlc-panel="image model"<?php echo in_array( $kind, array( 'image', 'model' ), true ) ? '' : ' hidden'; ?>>
					<label for="utlc_images">이미지 <span class="utlc-muted">(JPG/PNG/GIF/WEBP, 장당 최대 <?php echo esc_html( $max_mb ); ?>MB, 최대 <?php echo esc_html( $max_img ); ?>장)</span></label>
					<?php if ( $images ) : ?>
						<div class="utlc-submit__existing">
							<?php foreach ( $images as $aid ) : ?>
								<label class="utlc-check">
									<?php echo wp_get_attachment_image( $aid, 'thumbnail' ); ?>
									<input type="checkbox" name="utlc_remove_images[]" value="<?php echo esc_attr( $aid ); ?>"> 삭제
								</label>
							<?php endforeach; ?>
						</div>
					<?php endif; ?>
					<input class="utlc-input" type="file" id="utlc_images" name="utlc_images[]" accept="image/jpeg,image/png,image/gif,image/webp" multiple data-utlc-images>
					<div class="utlc-submit__previews" data-utlc-previews></div>
				</div>

				<div data-utlc-panel="model"<?php echo 'model' === $kind ? '' : ' hidden'; ?>>
					<?php do_action( 'utlc_submit_model_fields', $edit_post ); ?>
				</div>

				<div class="utlc-field">
					<label for="utlc_flair">말머리</label>
					<select class="utlc-select" id="utlc_flair" name="utlc_flair" data-utlc-flair-select data-current="<?php echo esc_attr( $flair ); ?>">
						<option value="">없음</option>
						<?php foreach ( self::flairs( $board ) as $f ) : ?>
							<option value="<?php echo esc_attr( $f ); ?>" <?php selected( $f, $flair ); ?>><?php echo esc_html( $f ); ?></option>
						<?php endforeach; ?>
					</select>
				</div>

				<div class="utlc-submit__actions">
					<button type="submit" class="utlc-btn utlc-btn--primary" data-utlc-submit-btn><?php echo $edit_post ? '수정 완료' : '게시하기'; ?></button>
					<?php if ( $edit_post ) : ?>
						<a class="utlc-btn utlc-btn--ghost" href="<?php echo esc_url( get_permalink( $edit_post ) ); ?>">취소</a>
					<?php endif; ?>
				</div>
			</form>
		</div>
		<?php
	}

	/* ---------------- handler ---------------- */

	public static function handle_nopriv() {
		$url = function_exists( 'utlc_login_url' ) ? utlc_login_url( wp_get_referer() ? wp_get_referer() : '' ) : wp_login_url();
		if ( function_exists( 'utlc_flash' ) ) {
			utlc_flash( '로그인이 필요합니다.', 'error' );
		}
		wp_safe_redirect( $url );
		exit;
	}

	private static function fail( $msg, $back ) {
		if ( function_exists( 'utlc_flash' ) ) {
			utlc_flash( $msg, 'error' );
		}
		wp_safe_redirect( $back );
		exit;
	}

	private static function file_list() {
		$out = array();
		if ( empty( $_FILES['utlc_images'] ) || ! is_array( $_FILES['utlc_images']['name'] ) ) {
			return $out;
		}
		$f = $_FILES['utlc_images']; // phpcs:ignore
		foreach ( $f['name'] as $i => $name ) {
			if ( ! isset( $f['error'][ $i ] ) || UPLOAD_ERR_NO_FILE === (int) $f['error'][ $i ] || '' === $name ) {
				continue;
			}
			$out[] = array(
				'name'     => $name,
				'type'     => $f['type'][ $i ],
				'tmp_name' => $f['tmp_name'][ $i ],
				'error'    => (int) $f['error'][ $i ],
				'size'     => (int) $f['size'][ $i ],
			);
		}
		return $out;
	}

	private static function image_mimes() {
		return array(
			'jpg|jpeg|jpe' => 'image/jpeg',
			'png'          => 'image/png',
			'gif'          => 'image/gif',
			'webp'         => 'image/webp',
		);
	}

	public static function handle_submit() {
		$ref  = wp_get_referer();
		$back = $ref ? $ref : ( function_exists( 'utlc_submit_url' ) ? utlc_submit_url() : home_url( '/submit/' ) );

		if ( empty( $_POST ) && ! empty( $_SERVER['CONTENT_LENGTH'] ) ) {
			self::fail( '전송한 파일이 서버 업로드 한도(' . size_format( wp_max_upload_size() ) . ')를 초과했습니다.', $back );
		}
		$uid = get_current_user_id();
		if ( ! $uid ) {
			self::handle_nopriv();
		}
		if ( ! isset( $_POST['utlc_submit_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['utlc_submit_nonce'] ) ), 'utlc_submit' ) ) {
			self::fail( '보안 토큰이 만료되었습니다. 다시 시도해 주세요.', $back );
		}
		if ( function_exists( 'utlc_is_banned' ) && utlc_is_banned( $uid ) ) {
			self::fail( '이용이 제한된 계정입니다.', $back );
		}
		if ( ! empty( $_POST['utlc_hp'] ) ) {
			self::fail( '요청을 처리할 수 없습니다.', $back );
		}

		$edit_id   = isset( $_POST['utlc_edit'] ) ? absint( $_POST['utlc_edit'] ) : 0;
		$edit_post = null;
		$is_edit   = false;
		if ( $edit_id ) {
			$edit_post = get_post( $edit_id );
			if ( ! $edit_post || 'utlc_post' !== $edit_post->post_type || 'trash' === $edit_post->post_status
				|| ( (int) $edit_post->post_author !== $uid && ! self::can_moderate( $uid, self::post_board( $edit_post ) ) ) ) {
				self::fail( '이 글을 수정할 권한이 없습니다.', $back );
			}
			$is_edit = true;
		}

		$board = self::get_board( isset( $_POST['utlc_board'] ) ? absint( $_POST['utlc_board'] ) : 0 );
		if ( ! $board && $edit_post ) {
			$board = self::post_board( $edit_post );
		}
		if ( ! $board ) {
			self::fail( '게시판을 선택해 주세요.', $back );
		}
		$old_board = $edit_post ? self::post_board( $edit_post ) : null;
		$same      = $old_board && (int) $old_board->term_id === (int) $board->term_id;
		if ( ! $same && ! self::can_post( $uid, $board ) ) {
			self::fail( '이 게시판에 글을 쓸 권한이 없습니다.', $back );
		}

		if ( ! $is_edit && ! self::can_moderate( $uid ) && function_exists( 'utlc_rate_limited' ) ) {
			if ( utlc_rate_limited( 'post_' . $uid, (int) self::opt( 'post_rate_per_hour', 10 ), HOUR_IN_SECONDS ) ) {
				self::fail( '글을 너무 자주 작성했습니다. 잠시 후 다시 시도해 주세요.', $back );
			}
		}

		$type = self::board_type( $board );
		$kind = isset( $_POST['utlc_kind'] ) ? sanitize_key( wp_unslash( $_POST['utlc_kind'] ) ) : 'text';
		if ( 'market' === $type ) {
			$kind = 'model';
		} elseif ( ! in_array( $kind, array( 'text', 'image', 'link' ), true ) ) {
			$kind = 'text';
		}

		$title_raw = isset( $_POST['utlc_title'] ) ? trim( wp_unslash( $_POST['utlc_title'] ) ) : ''; // phpcs:ignore
		$tlen      = function_exists( 'mb_strlen' ) ? mb_strlen( $title_raw, 'UTF-8' ) : strlen( $title_raw );
		if ( $tlen < 2 || $tlen > 300 ) {
			self::fail( '제목은 2~300자로 입력해 주세요.', $back );
		}
		$title = class_exists( 'UTLC_Content' ) ? UTLC_Content::clean_title( $title_raw ) : esc_html( $title_raw );

		$body = isset( $_POST['utlc_body'] ) ? (string) wp_unslash( $_POST['utlc_body'] ) : ''; // phpcs:ignore
		$body = wp_check_invalid_utf8( str_replace( array( "\r\n", "\r" ), "\n", $body ) );
		$body = rtrim( $body );
		$blen = function_exists( 'mb_strlen' ) ? mb_strlen( $body, 'UTF-8' ) : strlen( $body );
		if ( $blen > 40000 ) {
			self::fail( '본문은 40,000자 이하로 입력해 주세요.', $back );
		}

		$url = '';
		if ( 'link' === $kind ) {
			$url = isset( $_POST['utlc_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['utlc_url'] ) ), array( 'http', 'https' ) ) : ''; // phpcs:ignore
			if ( ! $url || ! preg_match( '#^https?://[^\s/]+#i', $url ) ) {
				self::fail( '올바른 http(s) 링크를 입력해 주세요.', $back );
			}
		}

		$flair  = isset( $_POST['utlc_flair'] ) ? sanitize_text_field( wp_unslash( $_POST['utlc_flair'] ) ) : '';
		$flairs = self::flairs( $board );
		if ( '' !== $flair && ! in_array( $flair, $flairs, true ) ) {
			$flair = '';
		}

		// Images.
		$existing = $edit_post ? array_filter( array_map( 'absint', (array) get_post_meta( $edit_post->ID, '_utlc_images', true ) ) ) : array();
		$remove   = isset( $_POST['utlc_remove_images'] ) ? array_map( 'absint', (array) $_POST['utlc_remove_images'] ) : array();
		$existing = array_values( array_diff( $existing, $remove ) );
		$files    = in_array( $kind, array( 'image', 'model' ), true ) ? self::file_list() : array();
		$max_img  = max( 1, (int) self::opt( 'images_per_post', 10 ) );
		$max_b    = max( 1, (int) self::opt( 'image_max_mb', 10 ) ) * MB_IN_BYTES;
		foreach ( $files as $file ) {
			if ( UPLOAD_ERR_OK !== $file['error'] ) {
				self::fail( '이미지 업로드에 실패했습니다: ' . $file['name'], $back );
			}
			if ( $file['size'] > $max_b ) {
				self::fail( '이미지는 장당 ' . (int) self::opt( 'image_max_mb', 10 ) . 'MB 이하여야 합니다: ' . $file['name'], $back );
			}
			$chk = wp_check_filetype_and_ext( $file['tmp_name'], $file['name'], self::image_mimes() );
			if ( empty( $chk['type'] ) || ! in_array( $chk['type'], self::image_mimes(), true ) ) {
				self::fail( '허용되지 않는 이미지 형식입니다: ' . $file['name'], $back );
			}
		}
		if ( count( $existing ) + count( $files ) > $max_img ) {
			self::fail( '이미지는 최대 ' . $max_img . '장까지 올릴 수 있습니다.', $back );
		}
		if ( in_array( $kind, array( 'image', 'model' ), true ) && count( $existing ) + count( $files ) < 1 ) {
			self::fail( '이미지를 1장 이상 올려 주세요.', $back );
		}
		if ( 'model' === $kind ) {
			$ok = apply_filters( 'utlc_validate_model', true, $edit_post );
			if ( is_wp_error( $ok ) ) {
				self::fail( $ok->get_error_message(), $back );
			}
			if ( false === $ok ) {
				self::fail( '모델 정보를 확인해 주세요.', $back );
			}
		}

		// Save.
		$data = array(
			'post_type'    => 'utlc_post',
			'post_title'   => $title,
			'post_content' => $body,
		);
		if ( $is_edit ) {
			$data['ID'] = $edit_post->ID;
			$status     = $edit_post->post_status;
		} else {
			$status                 = apply_filters( 'utlc_new_post_status', 'publish', $kind, $board, $uid );
			$status                 = in_array( $status, array( 'publish', 'pending', 'draft' ), true ) ? $status : 'publish';
			$data['post_status']    = $status;
			$data['post_author']    = $uid;
			$data['comment_status'] = 'open';
			$data['ping_status']    = 'closed';
		}

		$had_kses = false !== has_filter( 'content_save_pre', 'wp_filter_post_kses' ) || false !== has_filter( 'title_save_pre', 'wp_filter_kses' );
		kses_remove_filters();
		$post_id = $is_edit ? wp_update_post( wp_slash( $data ), true ) : wp_insert_post( wp_slash( $data ), true );
		if ( $had_kses ) {
			kses_init_filters();
		}
		if ( is_wp_error( $post_id ) || ! $post_id ) {
			self::fail( '글을 저장하지 못했습니다. ' . ( is_wp_error( $post_id ) ? $post_id->get_error_message() : '' ), $back );
		}
		$post_id = (int) $post_id;

		wp_set_object_terms( $post_id, array( (int) $board->term_id ), 'utlc_board', false );
		update_post_meta( $post_id, '_utlc_format', 'md' );
		update_post_meta( $post_id, '_utlc_kind', $kind );
		if ( 'link' === $kind ) {
			update_post_meta( $post_id, '_utlc_url', $url );
		} else {
			delete_post_meta( $post_id, '_utlc_url' );
		}
		if ( '' !== $flair ) {
			update_post_meta( $post_id, '_utlc_flair', $flair );
		} else {
			delete_post_meta( $post_id, '_utlc_flair' );
		}
		if ( $is_edit ) {
			update_post_meta( $post_id, '_utlc_edited', current_time( 'mysql', true ) );
		} else {
			add_post_meta( $post_id, '_utlc_score', 0, true );
		}

		// Upload images.
		$ids = $existing;
		if ( $files ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			foreach ( $files as $file ) {
				$up = wp_handle_upload(
					$file,
					array(
						'test_form' => false,
						'mimes'     => self::image_mimes(),
					)
				);
				if ( ! is_array( $up ) || isset( $up['error'] ) || empty( $up['file'] ) ) {
					continue;
				}
				$att_id = wp_insert_attachment(
					array(
						'post_mime_type' => $up['type'],
						'post_title'     => sanitize_file_name( pathinfo( $file['name'], PATHINFO_FILENAME ) ),
						'post_content'   => '',
						'post_status'    => 'inherit',
						'post_author'    => $uid,
					),
					$up['file'],
					$post_id
				);
				if ( is_wp_error( $att_id ) || ! $att_id ) {
					continue;
				}
				wp_update_attachment_metadata( $att_id, wp_generate_attachment_metadata( $att_id, $up['file'] ) );
				$ids[] = (int) $att_id;
			}
		}
		$ids = array_values( array_unique( array_filter( $ids ) ) );
		if ( $ids ) {
			update_post_meta( $post_id, '_utlc_images', $ids );
			$thumb = (int) get_post_thumbnail_id( $post_id );
			if ( ! $thumb || ! in_array( $thumb, $ids, true ) ) {
				set_post_thumbnail( $post_id, $ids[0] );
			}
		} else {
			delete_post_meta( $post_id, '_utlc_images' );
			if ( $is_edit && in_array( (int) get_post_thumbnail_id( $post_id ), $remove, true ) ) {
				delete_post_thumbnail( $post_id );
			}
		}

		if ( 'model' === $kind ) {
			$saved = apply_filters( 'utlc_save_model', true, $post_id, $is_edit );
			if ( is_wp_error( $saved ) ) {
				if ( ! $is_edit ) {
					wp_delete_post( $post_id, true );
				}
				self::fail( $saved->get_error_message(), $back );
			}
		}

		if ( ! $is_edit && class_exists( 'UTLC_Core' ) && method_exists( 'UTLC_Core', 'vote' ) ) {
			UTLC_Core::vote( $uid, 'post', $post_id, 1 );
		}

		clean_post_cache( $post_id );
		$post = get_post( $post_id );
		if ( 'publish' === $post->post_status ) {
			if ( function_exists( 'utlc_flash' ) ) {
				utlc_flash( $is_edit ? '글이 수정되었습니다.' : '글이 등록되었습니다.', 'success' );
			}
			wp_safe_redirect( get_permalink( $post_id ) );
			exit;
		}
		if ( function_exists( 'utlc_flash' ) ) {
			utlc_flash( $is_edit ? '글이 수정되었습니다. 심사 후 공개됩니다.' : '글이 접수되었습니다. 심사 후 공개됩니다.', 'info' );
		}
		wp_safe_redirect( function_exists( 'utlc_user_url' ) ? utlc_user_url( $uid ) : home_url( '/' ) );
		exit;
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

	public static function has_paid_orders( $post_id ) {
		global $wpdb;
		$table = $wpdb->prefix . 'utlc_orders';
		if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
			return false;
		}
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE listing_id = %d AND status IN ('paid','refunded')", $post_id ) ) > 0; // phpcs:ignore
	}

	public static function ajax_delete_post() {
		self::verify();
		$uid     = get_current_user_id();
		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;
		if ( ! $post || 'utlc_post' !== $post->post_type || 'trash' === $post->post_status ) {
			wp_send_json_error( array( 'message' => '글을 찾을 수 없습니다.' ), 404 );
		}
		$board = self::post_board( $post );
		if ( (int) $post->post_author !== $uid && ! self::can_moderate( $uid, $board ) ) {
			wp_send_json_error( array( 'message' => '삭제 권한이 없습니다.' ), 403 );
		}
		if ( 'model' === get_post_meta( $post_id, '_utlc_kind', true ) && self::has_paid_orders( $post_id ) ) {
			$had_kses = false !== has_filter( 'content_save_pre', 'wp_filter_post_kses' );
			kses_remove_filters();
			wp_update_post( array( 'ID' => $post_id, 'post_status' => 'draft' ) );
			if ( $had_kses ) {
				kses_init_filters();
			}
			$msg = '판매 내역이 있어 비공개(초안)로 전환했습니다.';
		} else {
			wp_trash_post( $post_id );
			$msg = '글이 삭제되었습니다.';
		}
		$redirect = $board && function_exists( 'utlc_board_url' ) ? utlc_board_url( $board ) : ( function_exists( 'utlc_community_url' ) ? utlc_community_url() : home_url( '/' ) );
		wp_send_json_success(
			array(
				'message'  => $msg,
				'redirect' => $redirect,
			)
		);
	}

	public static function ajax_pin() {
		self::verify();
		$uid     = get_current_user_id();
		$post_id = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;
		if ( ! $post || ! in_array( $post->post_type, array( 'utlc_post', 'post' ), true ) ) {
			wp_send_json_error( array( 'message' => '글을 찾을 수 없습니다.' ), 404 );
		}
		if ( ! self::can_moderate( $uid, self::post_board( $post ) ) ) {
			wp_send_json_error( array( 'message' => '권한이 없습니다.' ), 403 );
		}
		$pin = ! empty( $_POST['pin'] ) && '0' !== $_POST['pin'];
		if ( $pin ) {
			update_post_meta( $post_id, '_utlc_pinned', '1' );
		} else {
			delete_post_meta( $post_id, '_utlc_pinned' );
		}
		wp_send_json_success(
			array(
				'pinned'  => $pin,
				'message' => $pin ? '고정했습니다.' : '고정을 해제했습니다.',
			)
		);
	}
}
