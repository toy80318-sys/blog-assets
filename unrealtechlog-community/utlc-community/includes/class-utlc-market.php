<?php
/**
 * 3D model marketplace: listing fields, storage, buy box, download, profile tabs.
 *
 * @package UTLC
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Market {

	const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js';
	const GLB_MAX_MB   = 30;

	public static function init() {
		add_action( 'utlc_submit_model_fields', array( __CLASS__, 'render_fields' ) );
		add_filter( 'utlc_validate_model', array( __CLASS__, 'validate' ), 10, 2 );
		add_filter( 'utlc_save_model', array( __CLASS__, 'save' ), 10, 3 );
		add_filter( 'utlc_new_post_status', array( __CLASS__, 'new_post_status' ), 10, 4 );
		add_action( 'admin_post_utlc_payout_request', array( __CLASS__, 'handle_payout_request' ) );
		add_action( 'admin_post_nopriv_utlc_payout_request', array( __CLASS__, 'handle_payout_nopriv' ) );
		add_action( 'utlc_enqueue_assets', array( __CLASS__, 'enqueue' ) );
	}

	/* ---------------------------------------------------------------- helpers */

	public static function opt( $key, $default = null ) {
		if ( function_exists( 'utlc_opt' ) ) {
			$v = utlc_opt( $key );
			return ( null === $v ) ? $default : $v;
		}
		return $default;
	}

	public static function krw( $n ) {
		if ( function_exists( 'utlc_krw' ) ) {
			return utlc_krw( (int) $n );
		}
		return (int) $n > 0 ? number_format( (int) $n ) . '원' : '무료';
	}

	public static function licenses() {
		return array(
			'personal'   => '개인용 라이선스',
			'commercial' => '상업용 라이선스',
			'cc0'        => 'CC0 (퍼블릭 도메인)',
		);
	}

	public static function formats() {
		return array(
			'fbx'       => 'FBX',
			'obj'       => 'OBJ',
			'glb'       => 'glTF / GLB',
			'blend'     => 'Blender',
			'uasset'    => 'Unreal (.uasset)',
			'usd'       => 'USD / USDZ',
			'stl'       => 'STL',
			'max'       => '3ds Max',
			'maya'      => 'Maya',
			'c4d'       => 'Cinema 4D',
			'substance' => 'Substance',
			'other'     => '기타',
		);
	}

	public static function features() {
		return array(
			'rigged'     => '리깅',
			'animated'   => '애니메이션',
			'pbr'        => 'PBR 텍스처',
			'lod'        => 'LOD',
			'lowpoly'    => '로우폴리',
			'uv'         => 'UV 언랩',
			'nanite'     => '나나이트 지원',
			'game_ready' => '게임 레디',
		);
	}

	public static function allowed_extensions() {
		$raw = (string) self::opt( 'model_extensions', 'zip,7z,rar,fbx,obj,glb,gltf,blend,uasset,umap,usd,usdz,stl,abc,ma,mb,max,c4d,3ds,dae,ply,spp,sbsar' );
		$out = array();
		foreach ( explode( ',', strtolower( $raw ) ) as $e ) {
			$e = preg_replace( '/[^a-z0-9]/', '', $e );
			if ( '' !== $e && ! in_array( $e, array( 'php', 'phtml', 'phar', 'js', 'html', 'htm', 'svg', 'exe', 'sh' ), true ) ) {
				$out[] = $e;
			}
		}
		return $out;
	}

	public static function is_model( $post ) {
		$post = get_post( $post );
		return $post && 'utlc_post' === $post->post_type && 'model' === get_post_meta( $post->ID, '_utlc_kind', true );
	}

	public static function login_url( $redirect = '' ) {
		return function_exists( 'utlc_login_url' ) ? utlc_login_url( $redirect ) : wp_login_url( $redirect );
	}

	public static function user_url( $user ) {
		return function_exists( 'utlc_user_url' ) ? utlc_user_url( $user ) : get_author_posts_url( is_object( $user ) ? $user->ID : (int) $user );
	}

	public static function can_download( $user_id, $post ) {
		$post = get_post( $post );
		if ( ! $user_id || ! $post ) {
			return false;
		}
		if ( (int) $post->post_author === (int) $user_id || user_can( $user_id, 'manage_options' ) ) {
			return true;
		}
		return class_exists( 'UTLC_Orders' ) && UTLC_Orders::has_purchased( $user_id, $post->ID );
	}

	protected static function has_upload( $field ) {
		return isset( $_FILES[ $field ] ) && is_array( $_FILES[ $field ] ) && isset( $_FILES[ $field ]['error'] ) && UPLOAD_ERR_NO_FILE !== (int) $_FILES[ $field ]['error'];
	}

	/* ---------------------------------------------------------------- storage */

	public static function private_dir() {
		if ( defined( 'UTLC_PRIVATE_DIR' ) && UTLC_PRIVATE_DIR ) {
			$dir = UTLC_PRIVATE_DIR;
		} else {
			$up  = wp_upload_dir( null, false );
			$dir = $up['basedir'] . '/utlc-private';
		}
		$dir = untrailingslashit( wp_normalize_path( $dir ) );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$files = array(
			'.htaccess'  => "# UTLC private files\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n",
			'index.php'  => "<?php\n// Silence is golden.\n",
			'web.config' => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration>\n  <system.webServer>\n    <authorization>\n      <deny users=\"*\" />\n    </authorization>\n  </system.webServer>\n</configuration>\n",
		);
		foreach ( $files as $name => $content ) {
			if ( is_dir( $dir ) && ! file_exists( $dir . '/' . $name ) ) {
				@file_put_contents( $dir . '/' . $name, $content ); // phpcs:ignore
			}
		}
		return $dir;
	}

	protected static function preview_dir() {
		$up  = wp_upload_dir( null, false );
		$dir = untrailingslashit( wp_normalize_path( $up['basedir'] ) ) . '/utlc-previews';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		if ( is_dir( $dir ) && ! file_exists( $dir . '/index.php' ) ) {
			@file_put_contents( $dir . '/index.php', "<?php\n// Silence is golden.\n" ); // phpcs:ignore
		}
		return array( $dir, untrailingslashit( $up['baseurl'] ) . '/utlc-previews' );
	}

	protected static function file_path( $post_id ) {
		$file = get_post_meta( $post_id, '_utlc_file', true );
		if ( ! is_array( $file ) || empty( $file['path'] ) ) {
			return '';
		}
		$base = self::private_dir();
		$full = $base . '/' . ltrim( str_replace( '..', '', $file['path'] ), '/' );
		$real = realpath( $full );
		$rb   = realpath( $base );
		if ( ! $real || ! $rb || 0 !== strpos( wp_normalize_path( $real ), trailingslashit( wp_normalize_path( $rb ) ) ) || ! is_file( $real ) ) {
			return '';
		}
		return $real;
	}

	/* ---------------------------------------------------------------- submit hooks */

	public static function render_fields( $edit_post = null ) {
		$pid      = ( $edit_post && isset( $edit_post->ID ) ) ? (int) $edit_post->ID : 0;
		$price    = $pid ? (int) get_post_meta( $pid, '_utlc_price', true ) : 0;
		$license  = $pid ? (string) get_post_meta( $pid, '_utlc_license', true ) : 'personal';
		$formats  = $pid ? (array) get_post_meta( $pid, '_utlc_formats', true ) : array();
		$features = $pid ? (array) get_post_meta( $pid, '_utlc_features', true ) : array();
		$poly     = $pid ? (string) get_post_meta( $pid, '_utlc_polycount', true ) : '';
		$engine   = $pid ? (string) get_post_meta( $pid, '_utlc_engine_version', true ) : '';
		$file     = $pid ? get_post_meta( $pid, '_utlc_file', true ) : array();
		$file_url = $pid ? (string) get_post_meta( $pid, '_utlc_file_url', true ) : '';
		$glb      = $pid ? (string) get_post_meta( $pid, '_utlc_preview_glb', true ) : '';
		$min      = (int) self::opt( 'min_price', 1000 );
		$max      = (int) self::opt( 'max_price', 5000000 );
		$max_mb   = (int) self::opt( 'model_max_mb', 200 );
		?>
		<div class="utlc-market-fields">
			<div class="utlc-field">
				<label for="utlc_price">가격 (원)</label>
				<input type="number" class="utlc-input" id="utlc_price" name="utlc_price" min="0" max="<?php echo esc_attr( $max ); ?>" step="100" value="<?php echo esc_attr( $price ); ?>">
				<p class="utlc-muted"><?php echo esc_html( sprintf( '0원은 무료 배포입니다. 유료 상품은 %s ~ %s 사이로 설정하세요.', number_format( $min ) . '원', number_format( $max ) . '원' ) ); ?></p>
			</div>
			<div class="utlc-field">
				<label for="utlc_license">라이선스</label>
				<select class="utlc-select" id="utlc_license" name="utlc_license">
					<?php foreach ( self::licenses() as $k => $label ) : ?>
						<option value="<?php echo esc_attr( $k ); ?>" <?php selected( $license, $k ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
			<div class="utlc-field">
				<label>파일 형식</label>
				<div>
					<?php foreach ( self::formats() as $k => $label ) : ?>
						<label class="utlc-check"><input type="checkbox" name="utlc_formats[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $formats, true ) ); ?>> <?php echo esc_html( $label ); ?></label>
					<?php endforeach; ?>
				</div>
			</div>
			<div class="utlc-field">
				<label for="utlc_polycount">폴리곤 수</label>
				<input type="text" class="utlc-input" id="utlc_polycount" name="utlc_polycount" maxlength="50" placeholder="예: 12,000 tris" value="<?php echo esc_attr( $poly ); ?>">
			</div>
			<div class="utlc-field">
				<label for="utlc_engine_version">엔진 / 툴 버전</label>
				<input type="text" class="utlc-input" id="utlc_engine_version" name="utlc_engine_version" maxlength="50" placeholder="예: Unreal Engine 5.4" value="<?php echo esc_attr( $engine ); ?>">
			</div>
			<div class="utlc-field">
				<label>특징</label>
				<div>
					<?php foreach ( self::features() as $k => $label ) : ?>
						<label class="utlc-check"><input type="checkbox" name="utlc_features[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $features, true ) ); ?>> <?php echo esc_html( $label ); ?></label>
					<?php endforeach; ?>
				</div>
			</div>
			<div class="utlc-field">
				<label for="utlc_model_file">모델 파일</label>
				<input type="file" class="utlc-input" id="utlc_model_file" name="utlc_model_file">
				<p class="utlc-muted"><?php echo esc_html( sprintf( '허용 확장자: %s · 최대 %dMB (서버 업로드 한도: %s)', implode( ', ', self::allowed_extensions() ), $max_mb, size_format( wp_max_upload_size() ) ) ); ?></p>
				<?php if ( is_array( $file ) && ! empty( $file['name'] ) ) : ?>
					<p class="utlc-muted"><?php echo esc_html( sprintf( '현재 파일: %s (%s) — 새 파일을 올리면 교체됩니다.', $file['name'], size_format( (int) $file['size'] ) ) ); ?></p>
				<?php endif; ?>
			</div>
			<div class="utlc-field">
				<label for="utlc_model_url">또는 외부 다운로드 링크</label>
				<input type="url" class="utlc-input" id="utlc_model_url" name="utlc_model_url" placeholder="https://" value="<?php echo esc_attr( $file_url ); ?>">
				<p class="utlc-muted">파일이 큰 경우 구글 드라이브 등 외부 링크를 입력하세요. 링크는 구매자에게만 공개됩니다.</p>
			</div>
			<div class="utlc-field">
				<label for="utlc_preview_glb">3D 미리보기 (.glb, 선택)</label>
				<input type="file" class="utlc-input" id="utlc_preview_glb" name="utlc_preview_glb" accept=".glb,model/gltf-binary">
				<p class="utlc-muted"><?php echo esc_html( sprintf( '누구나 볼 수 있는 공개 미리보기 파일입니다. 최대 %dMB, 판매 원본을 올리지 마세요.', self::GLB_MAX_MB ) ); ?></p>
				<?php if ( $glb ) : ?>
					<p class="utlc-muted">현재 미리보기가 등록되어 있습니다. 새 파일을 올리면 교체됩니다.</p>
				<?php endif; ?>
			</div>
			<div class="utlc-field">
				<label class="utlc-check"><input type="checkbox" name="utlc_rights" value="1" required> 본인이 제작했거나 판매 권리를 가진 모델임을 확인합니다. (타인의 저작물 무단 판매 시 게시물이 삭제될 수 있습니다)</label>
			</div>
		</div>
		<?php
	}

	public static function validate( $ok, $edit_post = null ) {
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$pid   = ( $edit_post && isset( $edit_post->ID ) ) ? (int) $edit_post->ID : 0;
		$price = isset( $_POST['utlc_price'] ) ? (int) $_POST['utlc_price'] : 0; // phpcs:ignore
		$min   = (int) self::opt( 'min_price', 1000 );
		$max   = (int) self::opt( 'max_price', 5000000 );

		if ( $price < 0 || ( $price > 0 && ( $price < $min || $price > $max ) ) ) {
			return new WP_Error( 'utlc_price', sprintf( '가격은 0원(무료) 또는 %s원 ~ %s원 사이여야 합니다.', number_format( $min ), number_format( $max ) ) );
		}
		$license = isset( $_POST['utlc_license'] ) ? sanitize_key( wp_unslash( $_POST['utlc_license'] ) ) : ''; // phpcs:ignore
		if ( ! isset( self::licenses()[ $license ] ) ) {
			return new WP_Error( 'utlc_license', '라이선스를 선택하세요.' );
		}
		if ( empty( $_POST['utlc_rights'] ) ) { // phpcs:ignore
			return new WP_Error( 'utlc_rights', '판매 권리 확인에 동의해야 합니다.' );
		}

		$url      = isset( $_POST['utlc_model_url'] ) ? trim( wp_unslash( $_POST['utlc_model_url'] ) ) : ''; // phpcs:ignore
		$has_file = self::has_upload( 'utlc_model_file' );
		if ( '' !== $url && ! preg_match( '#^https?://#i', $url ) ) {
			return new WP_Error( 'utlc_url', '다운로드 링크는 http(s) 주소여야 합니다.' );
		}
		if ( ! $has_file && '' === $url ) {
			$existing = $pid && ( self::file_path( $pid ) || get_post_meta( $pid, '_utlc_file_url', true ) );
			if ( ! $existing ) {
				return new WP_Error( 'utlc_file', '모델 파일을 업로드하거나 다운로드 링크를 입력하세요.' );
			}
		}
		if ( $has_file ) {
			$f = $_FILES['utlc_model_file']; // phpcs:ignore
			if ( UPLOAD_ERR_OK !== (int) $f['error'] ) {
				return new WP_Error( 'utlc_file', in_array( (int) $f['error'], array( UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE ), true ) ? '파일이 서버 업로드 한도를 초과했습니다.' : '파일 업로드에 실패했습니다.' );
			}
			if ( (int) $f['size'] > (int) self::opt( 'model_max_mb', 200 ) * MB_IN_BYTES ) {
				return new WP_Error( 'utlc_file', sprintf( '모델 파일은 %dMB 이하여야 합니다.', (int) self::opt( 'model_max_mb', 200 ) ) );
			}
			$ext = strtolower( pathinfo( (string) $f['name'], PATHINFO_EXTENSION ) );
			if ( ! in_array( $ext, self::allowed_extensions(), true ) ) {
				return new WP_Error( 'utlc_file', '허용되지 않는 파일 형식입니다.' );
			}
		}
		if ( self::has_upload( 'utlc_preview_glb' ) ) {
			$g = self::check_glb();
			if ( is_wp_error( $g ) ) {
				return $g;
			}
		}
		return true;
	}

	protected static function check_glb() {
		$f = $_FILES['utlc_preview_glb']; // phpcs:ignore
		if ( UPLOAD_ERR_OK !== (int) $f['error'] || ! is_uploaded_file( $f['tmp_name'] ) ) {
			return new WP_Error( 'utlc_glb', '미리보기 파일 업로드에 실패했습니다.' );
		}
		if ( (int) $f['size'] > self::GLB_MAX_MB * MB_IN_BYTES ) {
			return new WP_Error( 'utlc_glb', sprintf( '미리보기 파일은 %dMB 이하여야 합니다.', self::GLB_MAX_MB ) );
		}
		if ( 'glb' !== strtolower( pathinfo( (string) $f['name'], PATHINFO_EXTENSION ) ) ) {
			return new WP_Error( 'utlc_glb', '미리보기는 .glb 파일만 가능합니다.' );
		}
		$fh    = fopen( $f['tmp_name'], 'rb' ); // phpcs:ignore
		$magic = $fh ? fread( $fh, 4 ) : ''; // phpcs:ignore
		if ( $fh ) {
			fclose( $fh ); // phpcs:ignore
		}
		if ( 'glTF' !== $magic ) {
			return new WP_Error( 'utlc_glb', '올바른 GLB 파일이 아닙니다.' );
		}
		return true;
	}

	public static function save( $ok, $post_id, $is_edit = false ) {
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$post_id = (int) $post_id;
		$check   = self::validate( true, $is_edit ? get_post( $post_id ) : null );
		if ( is_wp_error( $check ) ) {
			return $check;
		}

		// phpcs:disable WordPress.Security.NonceVerification
		$price    = isset( $_POST['utlc_price'] ) ? max( 0, (int) $_POST['utlc_price'] ) : 0;
		$license  = sanitize_key( wp_unslash( $_POST['utlc_license'] ) );
		$formats  = isset( $_POST['utlc_formats'] ) ? array_values( array_intersect( array_map( 'sanitize_key', (array) wp_unslash( $_POST['utlc_formats'] ) ), array_keys( self::formats() ) ) ) : array();
		$features = isset( $_POST['utlc_features'] ) ? array_values( array_intersect( array_map( 'sanitize_key', (array) wp_unslash( $_POST['utlc_features'] ) ), array_keys( self::features() ) ) ) : array();
		$poly     = isset( $_POST['utlc_polycount'] ) ? mb_substr( sanitize_text_field( wp_unslash( $_POST['utlc_polycount'] ) ), 0, 50 ) : '';
		$engine   = isset( $_POST['utlc_engine_version'] ) ? mb_substr( sanitize_text_field( wp_unslash( $_POST['utlc_engine_version'] ) ), 0, 50 ) : '';
		$url      = isset( $_POST['utlc_model_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['utlc_model_url'] ) ), array( 'http', 'https' ) ) : '';
		// phpcs:enable

		// Model file.
		if ( self::has_upload( 'utlc_model_file' ) ) {
			$f = $_FILES['utlc_model_file']; // phpcs:ignore
			if ( ! is_uploaded_file( $f['tmp_name'] ) ) {
				return new WP_Error( 'utlc_file', '파일 업로드에 실패했습니다.' );
			}
			$base = self::private_dir();
			$rel  = gmdate( 'Y' ) . '/' . gmdate( 'm' );
			if ( ! wp_mkdir_p( $base . '/' . $rel ) ) {
				return new WP_Error( 'utlc_file', '저장 폴더를 만들 수 없습니다.' );
			}
			$rel .= '/' . bin2hex( random_bytes( 16 ) ) . '.dat';
			if ( ! @move_uploaded_file( $f['tmp_name'], $base . '/' . $rel ) ) { // phpcs:ignore
				return new WP_Error( 'utlc_file', '파일을 저장하지 못했습니다.' );
			}
			@chmod( $base . '/' . $rel, 0640 ); // phpcs:ignore
			$old = self::file_path( $post_id );
			if ( $old ) {
				@unlink( $old ); // phpcs:ignore
			}
			$name = sanitize_file_name( wp_unslash( $f['name'] ) );
			update_post_meta( $post_id, '_utlc_file', array(
				'path' => $rel,
				'name' => '' !== $name ? $name : 'model.' . strtolower( pathinfo( (string) $f['name'], PATHINFO_EXTENSION ) ),
				'size' => (int) $f['size'],
				'ext'  => strtolower( pathinfo( (string) $f['name'], PATHINFO_EXTENSION ) ),
			) );
			delete_post_meta( $post_id, '_utlc_file_url' );
		} elseif ( '' !== $url ) {
			$old = self::file_path( $post_id );
			if ( $old ) {
				@unlink( $old ); // phpcs:ignore
			}
			delete_post_meta( $post_id, '_utlc_file' );
			update_post_meta( $post_id, '_utlc_file_url', $url );
		}

		// Public GLB preview.
		if ( self::has_upload( 'utlc_preview_glb' ) ) {
			list( $pdir, $purl ) = self::preview_dir();
			$name                = bin2hex( random_bytes( 16 ) ) . '.glb';
			if ( @move_uploaded_file( $_FILES['utlc_preview_glb']['tmp_name'], $pdir . '/' . $name ) ) { // phpcs:ignore
				@chmod( $pdir . '/' . $name, 0644 ); // phpcs:ignore
				update_post_meta( $post_id, '_utlc_preview_glb', $purl . '/' . $name );
			}
		}

		update_post_meta( $post_id, '_utlc_kind', 'model' );
		update_post_meta( $post_id, '_utlc_price', $price );
		update_post_meta( $post_id, '_utlc_license', $license );
		update_post_meta( $post_id, '_utlc_formats', $formats );
		update_post_meta( $post_id, '_utlc_features', $features );
		update_post_meta( $post_id, '_utlc_polycount', $poly );
		update_post_meta( $post_id, '_utlc_engine_version', $engine );
		add_post_meta( $post_id, '_utlc_sales_count', 0, true );
		add_post_meta( $post_id, '_utlc_download_count', 0, true );
		return true;
	}

	public static function new_post_status( $status, $kind = '', $board = null, $user_id = 0 ) {
		if ( 'model' === $kind && self::opt( 'market_review', 1 ) && ! user_can( $user_id ? $user_id : get_current_user_id(), 'edit_others_posts' ) ) {
			return 'pending';
		}
		return $status;
	}

	/* ---------------------------------------------------------------- display */

	public static function price_badge( $post ) {
		$post = get_post( $post );
		if ( ! self::is_model( $post ) ) {
			return '';
		}
		$price = (int) get_post_meta( $post->ID, '_utlc_price', true );
		return '<span class="utlc-badge utlc-price-badge' . ( $price > 0 ? '' : ' is-free' ) . '">' . esc_html( self::krw( $price ) ) . '</span>';
	}

	public static function render_box( $post ) {
		$post = get_post( $post );
		if ( ! self::is_model( $post ) ) {
			return;
		}
		$id       = (int) $post->ID;
		$uid      = get_current_user_id();
		$price    = (int) get_post_meta( $id, '_utlc_price', true );
		$license  = (string) get_post_meta( $id, '_utlc_license', true );
		$formats  = (array) get_post_meta( $id, '_utlc_formats', true );
		$features = (array) get_post_meta( $id, '_utlc_features', true );
		$poly     = (string) get_post_meta( $id, '_utlc_polycount', true );
		$engine   = (string) get_post_meta( $id, '_utlc_engine_version', true );
		$sales    = (int) get_post_meta( $id, '_utlc_sales_count', true );
		$glb      = (string) get_post_meta( $id, '_utlc_preview_glb', true );
		$file     = get_post_meta( $id, '_utlc_file', true );
		$seller   = get_userdata( $post->post_author );
		$licenses = self::licenses();
		$fmt_map  = self::formats();
		$feat_map = self::features();
		$can_dl   = self::can_download( $uid, $post );
		$pending  = ( $uid && class_exists( 'UTLC_Orders' ) ) ? UTLC_Orders::pending_for( $uid, $id ) : null;
		$gateways = class_exists( 'UTLC_Orders' ) ? UTLC_Orders::gateways( $id ) : array();
		$modal_id = 'utlc-buy-' . $id;

		$fmt_labels = array();
		foreach ( $formats as $f ) {
			if ( isset( $fmt_map[ $f ] ) ) {
				$fmt_labels[] = $fmt_map[ $f ];
			}
		}
		$feat_labels = array();
		foreach ( $features as $f ) {
			if ( isset( $feat_map[ $f ] ) ) {
				$feat_labels[] = $feat_map[ $f ];
			}
		}
		?>
		<div class="utlc-card utlc-market-box" data-listing="<?php echo esc_attr( $id ); ?>">
			<?php if ( $glb ) : ?>
				<script type="module" src="<?php echo esc_url( self::MODEL_VIEWER ); ?>"></script>
				<model-viewer class="utlc-model-viewer" src="<?php echo esc_url( $glb ); ?>" alt="<?php echo esc_attr( wp_strip_all_tags( get_the_title( $post ) ) ); ?>" camera-controls auto-rotate shadow-intensity="1" style="width:100%;height:360px;background:#f0f1f3;border-radius:8px"></model-viewer>
			<?php endif; ?>

			<div class="utlc-market-box__price"><strong><?php echo esc_html( self::krw( $price ) ); ?></strong></div>

			<table class="utlc-table utlc-market-box__meta">
				<tbody>
					<tr><th>라이선스</th><td><?php echo esc_html( isset( $licenses[ $license ] ) ? $licenses[ $license ] : '-' ); ?></td></tr>
					<?php if ( $fmt_labels ) : ?><tr><th>파일 형식</th><td><?php echo esc_html( implode( ', ', $fmt_labels ) ); ?></td></tr><?php endif; ?>
					<?php if ( '' !== $poly ) : ?><tr><th>폴리곤 수</th><td><?php echo esc_html( $poly ); ?></td></tr><?php endif; ?>
					<?php if ( '' !== $engine ) : ?><tr><th>엔진 버전</th><td><?php echo esc_html( $engine ); ?></td></tr><?php endif; ?>
					<?php if ( $feat_labels ) : ?><tr><th>특징</th><td><?php echo esc_html( implode( ', ', $feat_labels ) ); ?></td></tr><?php endif; ?>
					<?php if ( is_array( $file ) && ! empty( $file['size'] ) ) : ?><tr><th>파일 크기</th><td><?php echo esc_html( size_format( (int) $file['size'] ) . ( ! empty( $file['ext'] ) ? ' (.' . $file['ext'] . ')' : '' ) ); ?></td></tr><?php endif; ?>
					<tr><th>판매 수</th><td><?php echo esc_html( number_format( $sales ) ); ?></td></tr>
					<?php if ( $seller ) : ?><tr><th>판매자</th><td><a href="<?php echo esc_url( self::user_url( $seller ) ); ?>">u/<?php echo esc_html( $seller->user_nicename ); ?></a></td></tr><?php endif; ?>
				</tbody>
			</table>

			<div class="utlc-market-box__actions">
				<?php if ( 'publish' !== $post->post_status && ! $can_dl ) : ?>
					<div class="utlc-alert utlc-alert--info">현재 판매 중인 상품이 아닙니다.</div>
				<?php elseif ( ! $uid ) : ?>
					<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( self::login_url( get_permalink( $post ) ) ); ?>">로그인 후 <?php echo $price > 0 ? '구매하기' : '다운로드'; ?></a>
				<?php elseif ( $can_dl ) : ?>
					<?php if ( 'publish' !== $post->post_status ) : ?>
						<div class="utlc-alert utlc-alert--info">심사 중이거나 비공개 상태인 상품입니다.</div>
					<?php endif; ?>
					<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( class_exists( 'UTLC_Orders' ) ? UTLC_Orders::download_url( $id ) : home_url( '/utlc-download/' . $id . '/' ) ); ?>" rel="nofollow">다운로드</a>
				<?php else : ?>
					<button type="button" class="utlc-btn utlc-btn--primary" data-utlc-modal-open="<?php echo esc_attr( $modal_id ); ?>"><?php echo $price > 0 ? '구매하기' : '무료로 받기'; ?></button>
					<?php if ( $pending ) : ?>
						<a class="utlc-btn utlc-btn--ghost" href="<?php echo esc_url( UTLC_Orders::checkout_url( $pending->order_key ) ); ?>">진행 중인 주문 보기</a>
					<?php endif; ?>
				<?php endif; ?>
			</div>

			<?php if ( $uid && ! $can_dl && 'publish' === $post->post_status ) : ?>
				<div class="utlc-modal" id="<?php echo esc_attr( $modal_id ); ?>" hidden>
					<div class="utlc-modal__dialog" role="dialog" aria-modal="true">
						<form class="utlc-buy-form" data-listing="<?php echo esc_attr( $id ); ?>">
							<h3><?php echo $price > 0 ? '구매하기' : '무료로 받기'; ?></h3>
							<p><strong><?php echo esc_html( wp_strip_all_tags( get_the_title( $post ) ) ); ?></strong> · <?php echo esc_html( self::krw( $price ) ); ?></p>
							<?php if ( empty( $gateways ) ) : ?>
								<div class="utlc-alert utlc-alert--error">현재 사용할 수 있는 결제 수단이 없습니다.</div>
							<?php else : ?>
								<div class="utlc-field">
									<label>결제 수단</label>
									<?php $first = true; foreach ( $gateways as $gk => $glabel ) : ?>
										<label class="utlc-check"><input type="radio" name="gateway" value="<?php echo esc_attr( $gk ); ?>" <?php checked( $first ); ?>> <?php echo esc_html( $glabel ); ?></label>
									<?php $first = false; endforeach; ?>
								</div>
								<?php if ( isset( $gateways['bank'] ) ) : ?>
									<div class="utlc-field" data-utlc-bank-only <?php echo 'bank' === key( $gateways ) ? '' : 'hidden'; ?>>
										<label for="utlc-depositor-<?php echo esc_attr( $id ); ?>">입금자명</label>
										<input type="text" class="utlc-input" id="utlc-depositor-<?php echo esc_attr( $id ); ?>" name="depositor" maxlength="50">
									</div>
								<?php endif; ?>
								<?php if ( $price > 0 ) : ?>
									<div class="utlc-field">
										<p class="utlc-muted"><?php echo esc_html( (string) self::opt( 'refund_notice', '' ) ); ?></p>
										<label class="utlc-check"><input type="checkbox" name="agree" value="1"> 위 환불 규정을 확인했으며 동의합니다.</label>
									</div>
								<?php endif; ?>
								<div class="utlc-alert utlc-alert--error utlc-buy-error" hidden></div>
								<button type="submit" class="utlc-btn utlc-btn--primary"><?php echo $price > 0 ? esc_html( self::krw( $price ) . ' 결제하기' ) : '무료로 받기'; ?></button>
							<?php endif; ?>
							<button type="button" class="utlc-btn utlc-btn--ghost" data-utlc-modal-close>닫기</button>
						</form>
					</div>
				</div>
			<?php endif; ?>

			<p class="utlc-muted utlc-market-notice"><?php echo esc_html( (string) self::opt( 'market_notice', '' ) ); ?></p>
		</div>
		<?php
	}

	/* ---------------------------------------------------------------- download */

	public static function handle_download( $listing_id ) {
		nocache_headers();
		$listing_id = (int) $listing_id;
		if ( ! is_user_logged_in() ) {
			wp_safe_redirect( self::login_url( home_url( '/utlc-download/' . $listing_id . '/' ) ) );
			exit;
		}
		$post = get_post( $listing_id );
		if ( ! self::is_model( $post ) ) {
			wp_die( esc_html__( '상품을 찾을 수 없습니다.' ), '', array( 'response' => 404 ) );
		}
		if ( ! self::can_download( get_current_user_id(), $post ) ) {
			wp_die( esc_html( '다운로드 권한이 없습니다. 구매 후 이용하세요.' ), '', array( 'response' => 403 ) );
		}

		$path = self::file_path( $listing_id );
		$url  = (string) get_post_meta( $listing_id, '_utlc_file_url', true );
		if ( ! $path && '' === $url ) {
			wp_die( esc_html( '파일을 찾을 수 없습니다. 관리자에게 문의하세요.' ), '', array( 'response' => 404 ) );
		}
		$count = (int) get_post_meta( $listing_id, '_utlc_download_count', true );
		update_post_meta( $listing_id, '_utlc_download_count', $count + 1 );

		if ( ! $path ) {
			wp_redirect( esc_url_raw( $url, array( 'http', 'https' ) ) ); // phpcs:ignore WordPress.Security.SafeRedirect
			exit;
		}

		$file  = get_post_meta( $listing_id, '_utlc_file', true );
		$name  = ( is_array( $file ) && ! empty( $file['name'] ) ) ? (string) $file['name'] : 'model-' . $listing_id . '.zip';
		$ascii = preg_replace( '/[^A-Za-z0-9._-]/', '_', $name );
		$size  = filesize( $path );

		while ( ob_get_level() ) {
			ob_end_clean();
		}
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 0 ); // phpcs:ignore
		}
		header( 'Content-Type: application/octet-stream' );
		header( 'Content-Length: ' . $size );
		header( 'Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode( $name ) );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Cache-Control: private, no-store, no-cache, must-revalidate' );
		header( 'X-Robots-Tag: noindex' );

		$fh = fopen( $path, 'rb' ); // phpcs:ignore
		if ( $fh ) {
			while ( ! feof( $fh ) && ! connection_aborted() ) {
				echo fread( $fh, 1048576 ); // phpcs:ignore
				flush();
			}
			fclose( $fh ); // phpcs:ignore
		}
		exit;
	}

	/* ---------------------------------------------------------------- profile */

	public static function render_profile_tab( $tab, $user ) {
		$user = is_object( $user ) ? $user : get_userdata( (int) $user );
		if ( ! $user ) {
			return;
		}
		$self = is_user_logged_in() && get_current_user_id() === (int) $user->ID;

		if ( 'listings' === $tab ) {
			self::render_listings( $user, $self );
			return;
		}
		if ( ! $self ) {
			echo '<div class="utlc-alert utlc-alert--info">본인만 볼 수 있는 탭입니다.</div>';
			return;
		}
		if ( ! class_exists( 'UTLC_Orders' ) ) {
			return;
		}
		if ( 'purchases' === $tab ) {
			self::render_purchases( $user );
		} elseif ( 'sales' === $tab ) {
			self::render_sales( $user );
		}
	}

	protected static function listings_query( $user_id, $self ) {
		return new WP_Query( array(
			'post_type'      => 'utlc_post',
			'post_status'    => $self ? array( 'publish', 'pending', 'draft', 'private' ) : 'publish',
			'author'         => (int) $user_id,
			'posts_per_page' => 50,
			'no_found_rows'  => true,
			'meta_key'       => '_utlc_kind', // phpcs:ignore
			'meta_value'     => 'model', // phpcs:ignore
		) );
	}

	protected static function post_status_label( $status ) {
		$map = array( 'publish' => '판매 중', 'pending' => '심사 중', 'draft' => '판매 중지', 'private' => '비공개' );
		return isset( $map[ $status ] ) ? $map[ $status ] : $status;
	}

	protected static function render_listings( $user, $self ) {
		$q = self::listings_query( $user->ID, $self );
		if ( ! $q->have_posts() ) {
			echo '<div class="utlc-card utlc-muted">등록된 모델이 없습니다.</div>';
			return;
		}
		echo '<div class="utlc-grid utlc-listings">';
		foreach ( $q->posts as $p ) {
			$thumb = get_the_post_thumbnail_url( $p, 'medium' );
			echo '<div class="utlc-card utlc-listing-card">';
			if ( $thumb ) {
				echo '<a href="' . esc_url( get_permalink( $p ) ) . '"><img src="' . esc_url( $thumb ) . '" alt="" loading="lazy" style="width:100%;border-radius:6px"></a>';
			}
			echo '<h4><a href="' . esc_url( get_permalink( $p ) ) . '">' . esc_html( wp_strip_all_tags( get_the_title( $p ) ) ) . '</a></h4>';
			echo '<div>' . self::price_badge( $p ) . ' <span class="utlc-muted">판매 ' . esc_html( number_format( (int) get_post_meta( $p->ID, '_utlc_sales_count', true ) ) ) . '</span>'; // phpcs:ignore
			if ( $self ) {
				echo ' <span class="utlc-badge">' . esc_html( self::post_status_label( $p->post_status ) ) . '</span>';
			}
			echo '</div></div>';
		}
		echo '</div>';
	}

	protected static function render_purchases( $user ) {
		$orders = UTLC_Orders::for_buyer( $user->ID );
		if ( ! $orders ) {
			echo '<div class="utlc-card utlc-muted">구매 내역이 없습니다.</div>';
			return;
		}
		echo '<div class="utlc-card"><table class="utlc-table"><thead><tr><th>주문번호</th><th>상품</th><th>금액</th><th>상태</th><th>일시</th><th></th></tr></thead><tbody>';
		foreach ( $orders as $o ) {
			echo '<tr>';
			echo '<td><a href="' . esc_url( UTLC_Orders::checkout_url( $o->order_key ) ) . '">' . esc_html( $o->order_key ) . '</a></td>';
			echo '<td><a href="' . esc_url( get_permalink( $o->listing_id ) ) . '">' . esc_html( wp_strip_all_tags( get_the_title( $o->listing_id ) ) ) . '</a></td>';
			echo '<td>' . esc_html( self::krw( $o->amount ) ) . '</td>';
			echo '<td>' . esc_html( UTLC_Orders::status_label( $o->status ) ) . '</td>';
			echo '<td>' . esc_html( get_date_from_gmt( $o->created_at, 'Y-m-d H:i' ) ) . '</td>';
			echo '<td>';
			if ( 'paid' === $o->status ) {
				echo '<a class="utlc-btn utlc-btn--primary utlc-btn--sm" href="' . esc_url( UTLC_Orders::download_url( $o->listing_id ) ) . '" rel="nofollow">다운로드</a>';
			} elseif ( 'pending' === $o->status ) {
				if ( 'bank' === $o->gateway ) {
					echo '<a class="utlc-btn utlc-btn--ghost utlc-btn--sm" href="' . esc_url( UTLC_Orders::checkout_url( $o->order_key ) ) . '">입금 안내</a> ';
				}
				echo '<button type="button" class="utlc-btn utlc-btn--danger utlc-btn--sm" data-utlc-cancel-order="' . esc_attr( $o->order_key ) . '">취소</button>';
			}
			echo '</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	protected static function render_sales( $user ) {
		$bal = UTLC_Orders::balance( $user->ID );
		$min = (int) self::opt( 'min_payout', 10000 );
		?>
		<div class="utlc-grid utlc-balance">
			<div class="utlc-card utlc-stat"><span class="utlc-muted">총 수익</span><strong><?php echo esc_html( number_format( $bal['earned'] ) ); ?>원</strong></div>
			<div class="utlc-card utlc-stat"><span class="utlc-muted">정산 완료</span><strong><?php echo esc_html( number_format( $bal['paid_out'] ) ); ?>원</strong></div>
			<div class="utlc-card utlc-stat"><span class="utlc-muted">정산 대기</span><strong><?php echo esc_html( number_format( $bal['pending'] ) ); ?>원</strong></div>
			<div class="utlc-card utlc-stat"><span class="utlc-muted">출금 가능</span><strong><?php echo esc_html( number_format( $bal['available'] ) ); ?>원</strong></div>
		</div>
		<p class="utlc-muted"><?php echo esc_html( sprintf( '판매 수수료 %s%%가 차감된 금액입니다.', (string) self::opt( 'commission_rate', 20 ) ) ); ?></p>

		<h3>내 상품</h3>
		<?php
		$q = self::listings_query( $user->ID, true );
		if ( ! $q->have_posts() ) {
			echo '<div class="utlc-card utlc-muted">등록된 모델이 없습니다.</div>';
		} else {
			echo '<div class="utlc-card"><table class="utlc-table"><thead><tr><th>상품</th><th>가격</th><th>상태</th><th>판매</th><th>다운로드</th></tr></thead><tbody>';
			foreach ( $q->posts as $p ) {
				echo '<tr><td><a href="' . esc_url( get_permalink( $p ) ) . '">' . esc_html( wp_strip_all_tags( get_the_title( $p ) ) ) . '</a></td>';
				echo '<td>' . esc_html( self::krw( (int) get_post_meta( $p->ID, '_utlc_price', true ) ) ) . '</td>';
				echo '<td>' . esc_html( self::post_status_label( $p->post_status ) ) . '</td>';
				echo '<td>' . esc_html( number_format( (int) get_post_meta( $p->ID, '_utlc_sales_count', true ) ) ) . '</td>';
				echo '<td>' . esc_html( number_format( (int) get_post_meta( $p->ID, '_utlc_download_count', true ) ) ) . '</td></tr>';
			}
			echo '</tbody></table></div>';
		}
		?>

		<h3>최근 판매</h3>
		<?php
		$sales = UTLC_Orders::for_seller( $user->ID, 30 );
		if ( ! $sales ) {
			echo '<div class="utlc-card utlc-muted">판매 내역이 없습니다.</div>';
		} else {
			echo '<div class="utlc-card"><table class="utlc-table"><thead><tr><th>일시</th><th>상품</th><th>금액</th><th>정산액</th><th>상태</th></tr></thead><tbody>';
			foreach ( $sales as $o ) {
				echo '<tr><td>' . esc_html( get_date_from_gmt( $o->created_at, 'Y-m-d H:i' ) ) . '</td>';
				echo '<td>' . esc_html( wp_strip_all_tags( get_the_title( $o->listing_id ) ) ) . '</td>';
				echo '<td>' . esc_html( self::krw( $o->amount ) ) . '</td>';
				echo '<td>' . esc_html( number_format( (int) $o->seller_amount ) ) . '원</td>';
				echo '<td>' . esc_html( UTLC_Orders::status_label( $o->status ) ) . '</td></tr>';
			}
			echo '</tbody></table></div>';
		}
		?>

		<h3>정산 요청</h3>
		<form class="utlc-card utlc-payout-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="utlc_payout_request">
			<?php wp_nonce_field( 'utlc_payout', 'utlc_payout_nonce' ); ?>
			<div class="utlc-field">
				<label for="utlc_payout_amount">요청 금액 (원)</label>
				<input type="number" class="utlc-input" id="utlc_payout_amount" name="amount" min="<?php echo esc_attr( $min ); ?>" max="<?php echo esc_attr( $bal['available'] ); ?>" step="1" value="<?php echo esc_attr( $bal['available'] ); ?>" required>
				<p class="utlc-muted"><?php echo esc_html( sprintf( '최소 %s원부터 요청할 수 있습니다.', number_format( $min ) ) ); ?></p>
			</div>
			<div class="utlc-field">
				<label for="utlc_payout_bank">정산 계좌 (은행 / 계좌번호 / 예금주)</label>
				<textarea class="utlc-textarea" id="utlc_payout_bank" name="bank_info" rows="3" maxlength="500" required></textarea>
			</div>
			<button type="submit" class="utlc-btn utlc-btn--primary" <?php disabled( $bal['available'] < $min ); ?>>정산 요청</button>
		</form>

		<?php
		$payouts = UTLC_Orders::payouts_for( $user->ID, 20 );
		if ( $payouts ) {
			echo '<h3>정산 내역</h3><div class="utlc-card"><table class="utlc-table"><thead><tr><th>요청일</th><th>금액</th><th>상태</th><th>메모</th></tr></thead><tbody>';
			foreach ( $payouts as $po ) {
				echo '<tr><td>' . esc_html( get_date_from_gmt( $po->created_at, 'Y-m-d H:i' ) ) . '</td>';
				echo '<td>' . esc_html( number_format( (int) $po->amount ) ) . '원</td>';
				echo '<td>' . esc_html( UTLC_Orders::status_label( $po->status ) ) . '</td>';
				echo '<td>' . esc_html( (string) $po->admin_note ) . '</td></tr>';
			}
			echo '</tbody></table></div>';
		}
	}

	public static function handle_payout_request() {
		$uid  = get_current_user_id();
		$back = function_exists( 'utlc_user_url' ) ? add_query_arg( 'tab', 'sales', utlc_user_url( $uid ) ) : home_url( '/' );
		if ( ! $uid || ! isset( $_POST['utlc_payout_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['utlc_payout_nonce'] ) ), 'utlc_payout' ) ) {
			wp_die( esc_html( '잘못된 요청입니다.' ), '', array( 'response' => 403 ) );
		}
		if ( function_exists( 'utlc_is_banned' ) && utlc_is_banned( $uid ) ) {
			wp_die( esc_html( '이용이 제한된 계정입니다.' ), '', array( 'response' => 403 ) );
		}
		if ( ! class_exists( 'UTLC_Orders' ) ) {
			wp_safe_redirect( $back );
			exit;
		}
		$amount = isset( $_POST['amount'] ) ? absint( $_POST['amount'] ) : 0;
		$bank   = isset( $_POST['bank_info'] ) ? sanitize_textarea_field( wp_unslash( $_POST['bank_info'] ) ) : '';
		$res    = UTLC_Orders::request_payout( $uid, $amount, mb_substr( $bank, 0, 500 ) );
		if ( function_exists( 'utlc_flash' ) ) {
			if ( is_wp_error( $res ) ) {
				utlc_flash( $res->get_error_message(), 'error' );
			} else {
				utlc_flash( '정산 요청이 접수되었습니다.', 'success' );
			}
		}
		wp_safe_redirect( $back );
		exit;
	}

	public static function handle_payout_nopriv() {
		wp_safe_redirect( self::login_url() );
		exit;
	}

	/* ---------------------------------------------------------------- order page */

	public static function render_order_page( $order_key ) {
		$order_key = sanitize_text_field( (string) $order_key );
		$order     = ( $order_key && class_exists( 'UTLC_Orders' ) ) ? UTLC_Orders::get_by_key( $order_key ) : null;
		echo '<div class="utlc-order-page">';
		if ( ! is_user_logged_in() ) {
			echo '<div class="utlc-card"><p>주문을 확인하려면 로그인하세요.</p><a class="utlc-btn utlc-btn--primary" href="' . esc_url( self::login_url( home_url( '/checkout/' . rawurlencode( $order_key ) . '/' ) ) ) . '">로그인</a></div></div>';
			return;
		}
		if ( ! $order || ( (int) $order->buyer_id !== get_current_user_id() && ! current_user_can( 'manage_options' ) ) ) {
			echo '<div class="utlc-card utlc-alert utlc-alert--error">주문을 찾을 수 없습니다.</div></div>';
			return;
		}
		$title = wp_strip_all_tags( get_the_title( $order->listing_id ) );
		?>
		<div class="utlc-card">
			<h2>주문 확인</h2>
			<table class="utlc-table">
				<tbody>
					<tr><th>주문번호</th><td><?php echo esc_html( $order->order_key ); ?></td></tr>
					<tr><th>상품</th><td><a href="<?php echo esc_url( get_permalink( $order->listing_id ) ); ?>"><?php echo esc_html( $title ); ?></a></td></tr>
					<tr><th>결제 금액</th><td><?php echo esc_html( self::krw( $order->amount ) ); ?></td></tr>
					<tr><th>결제 수단</th><td><?php echo esc_html( UTLC_Orders::gateway_label( $order->gateway ) ); ?></td></tr>
					<tr><th>상태</th><td><span class="utlc-badge"><?php echo esc_html( UTLC_Orders::status_label( $order->status ) ); ?></span></td></tr>
					<tr><th>주문일시</th><td><?php echo esc_html( get_date_from_gmt( $order->created_at, 'Y-m-d H:i' ) ); ?></td></tr>
					<?php if ( $order->paid_at ) : ?><tr><th>결제일시</th><td><?php echo esc_html( get_date_from_gmt( $order->paid_at, 'Y-m-d H:i' ) ); ?></td></tr><?php endif; ?>
				</tbody>
			</table>

			<?php if ( 'pending' === $order->status && 'bank' === $order->gateway ) : ?>
				<div class="utlc-alert utlc-alert--info">
					<p><strong>아래 계좌로 입금해 주세요.</strong> 입금 확인 후 다운로드가 가능합니다.</p>
					<p>은행: <?php echo esc_html( (string) self::opt( 'bank_name', '' ) ); ?><br>
					계좌번호: <?php echo esc_html( (string) self::opt( 'bank_account', '' ) ); ?><br>
					예금주: <?php echo esc_html( (string) self::opt( 'bank_holder', '' ) ); ?><br>
					입금액: <strong><?php echo esc_html( number_format( (int) $order->amount ) ); ?>원</strong><br>
					입금자명: <?php echo esc_html( (string) $order->depositor ); ?></p>
				</div>
			<?php elseif ( 'pending' === $order->status ) : ?>
				<div class="utlc-alert utlc-alert--info">결제가 아직 완료되지 않았습니다. 상품 페이지에서 다시 시도할 수 있습니다.</div>
			<?php elseif ( 'paid' === $order->status ) : ?>
				<div class="utlc-alert utlc-alert--success">결제가 완료되었습니다.</div>
				<a class="utlc-btn utlc-btn--primary" href="<?php echo esc_url( UTLC_Orders::download_url( $order->listing_id ) ); ?>" rel="nofollow">다운로드</a>
			<?php elseif ( 'failed' === $order->status ) : ?>
				<div class="utlc-alert utlc-alert--error">결제에 실패했습니다. 상품 페이지에서 다시 시도해 주세요.</div>
			<?php endif; ?>

			<?php if ( 'pending' === $order->status && (int) $order->buyer_id === get_current_user_id() ) : ?>
				<button type="button" class="utlc-btn utlc-btn--danger" data-utlc-cancel-order="<?php echo esc_attr( $order->order_key ); ?>">주문 취소</button>
			<?php endif; ?>
			<p class="utlc-muted"><?php echo esc_html( (string) self::opt( 'refund_notice', '' ) ); ?></p>
			<p class="utlc-muted"><?php echo esc_html( (string) self::opt( 'market_notice', '' ) ); ?></p>
		</div>
		</div>
		<?php
	}

	/* ---------------------------------------------------------------- assets */

	public static function enqueue( $view = null ) {
		if ( ! defined( 'UTLC_URL' ) ) {
			return;
		}
		wp_enqueue_script( 'utlc-market', UTLC_URL . 'assets/js/utlc-market.js', array( 'utlc' ), defined( 'UTLC_VERSION' ) ? UTLC_VERSION : '1.0.0', true );
	}
}
