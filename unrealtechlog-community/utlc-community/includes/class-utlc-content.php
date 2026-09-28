<?php
/**
 * Markdown-lite renderer / sanitizer.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

class UTLC_Content {

	const TOKEN = 'UTLCMDBODYTOKEN';

	/** @var array post_id => raw */
	private static $stash = array();

	/** @var int */
	private static $bypass = 0;

	/** @var array */
	private static $ph = array();

	public static function init() {
		add_filter( 'the_content', array( __CLASS__, 'swap_content' ), -1000 );
		add_filter( 'the_content', array( __CLASS__, 'restore_content' ), 10000 );
		add_filter( 'get_the_excerpt', array( __CLASS__, 'filter_excerpt' ), 1, 2 );
		add_filter( 'comment_text', array( __CLASS__, 'filter_comment_text' ), 10000, 2 );
	}

	/* ---------------- filters ---------------- */

	public static function is_md( $post ) {
		$post = get_post( $post );
		return $post && 'utlc_post' === $post->post_type && 'md' === get_post_meta( $post->ID, '_utlc_format', true );
	}

	public static function swap_content( $content ) {
		if ( self::$bypass > 0 ) {
			return $content;
		}
		$post = get_post();
		if ( ! $post || ! self::is_md( $post ) ) {
			return $content;
		}
		self::$stash[ $post->ID ] = $post->post_content;
		return self::TOKEN . $post->ID . 'X';
	}

	public static function restore_content( $content ) {
		if ( empty( self::$stash ) || false === strpos( $content, self::TOKEN ) ) {
			return $content;
		}
		foreach ( self::$stash as $id => $raw ) {
			$token = self::TOKEN . $id . 'X';
			if ( false === strpos( $content, $token ) ) {
				continue;
			}
			$html    = self::render( $raw );
			$content = str_replace( array( '<p>' . $token . '</p>', $token ), array( $html, $html ), $content );
		}
		return $content;
	}

	public static function filter_excerpt( $excerpt, $post = null ) {
		$post = get_post( $post );
		if ( $post && self::is_md( $post ) && '' === trim( (string) $post->post_excerpt ) ) {
			return self::excerpt( $post->post_content );
		}
		return $excerpt;
	}

	public static function filter_comment_text( $text, $comment = null ) {
		if ( $comment && is_object( $comment ) && ! empty( $comment->comment_ID ) && 'md' === get_comment_meta( $comment->comment_ID, '_utlc_format', true ) ) {
			return self::render( $comment->comment_content );
		}
		return $text;
	}

	/* ---------------- public API ---------------- */

	public static function render_post( $post ) {
		$post = get_post( $post );
		if ( ! $post ) {
			return '';
		}
		if ( self::is_md( $post ) ) {
			return self::render( $post->post_content );
		}
		self::$bypass++;
		$out = apply_filters( 'the_content', $post->post_content );
		self::$bypass--;
		return str_replace( ']]>', ']]&gt;', $out );
	}

	public static function render( $raw ) {
		$raw   = (string) $raw;
		$raw   = str_replace( array( "\r\n", "\r" ), "\n", $raw );
		$raw   = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $raw );
		$lines = explode( "\n", $raw );

		$html  = '';
		$para  = array();
		$items = array();
		$ltype = '';
		$quote = array();
		$code  = null;

		$flush = function () use ( &$html, &$para, &$items, &$ltype, &$quote ) {
			if ( $para ) {
				$html .= '<p>' . implode( "<br>\n", array_map( array( 'UTLC_Content', 'inline' ), $para ) ) . "</p>\n";
				$para  = array();
			}
			if ( $items ) {
				$html .= '<' . $ltype . '>';
				foreach ( $items as $it ) {
					$html .= '<li>' . UTLC_Content::inline( $it ) . '</li>';
				}
				$html .= '</' . $ltype . ">\n";
				$items = array();
				$ltype = '';
			}
			if ( $quote ) {
				$html .= '<blockquote><p>' . implode( "<br>\n", array_map( array( 'UTLC_Content', 'inline' ), $quote ) ) . "</p></blockquote>\n";
				$quote = array();
			}
		};

		foreach ( $lines as $line ) {
			if ( null !== $code ) {
				if ( preg_match( '/^\s*```/', $line ) ) {
					$html .= '<pre><code>' . htmlspecialchars( implode( "\n", $code ), ENT_QUOTES, 'UTF-8' ) . "</code></pre>\n";
					$code  = null;
				} else {
					$code[] = $line;
				}
				continue;
			}
			if ( preg_match( '/^\s*```/', $line ) ) {
				$flush();
				$code = array();
				continue;
			}
			if ( '' === trim( $line ) ) {
				$flush();
				continue;
			}
			if ( preg_match( '/^\s*(#{1,3})\s+(.+)$/', $line, $m ) ) {
				$flush();
				$tag   = 'h' . ( strlen( $m[1] ) + 2 );
				$html .= '<' . $tag . '>' . self::inline( trim( $m[2] ) ) . '</' . $tag . ">\n";
				continue;
			}
			if ( preg_match( '/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/', $line ) ) {
				$flush();
				$html .= "<hr>\n";
				continue;
			}
			if ( preg_match( '/^\s*>\s?(.*)$/', $line, $m ) ) {
				if ( $para || $items ) {
					$flush();
				}
				$quote[] = $m[1];
				continue;
			}
			if ( preg_match( '/^\s*[-*+]\s+(.+)$/', $line, $m ) ) {
				if ( $para || $quote || ( $items && 'ul' !== $ltype ) ) {
					$flush();
				}
				$ltype   = 'ul';
				$items[] = $m[1];
				continue;
			}
			if ( preg_match( '/^\s*\d+[.)]\s+(.+)$/', $line, $m ) ) {
				if ( $para || $quote || ( $items && 'ol' !== $ltype ) ) {
					$flush();
				}
				$ltype   = 'ol';
				$items[] = $m[1];
				continue;
			}
			if ( $items || $quote ) {
				$flush();
			}
			$para[] = $line;
		}
		if ( null !== $code ) {
			$html .= '<pre><code>' . htmlspecialchars( implode( "\n", $code ), ENT_QUOTES, 'UTF-8' ) . "</code></pre>\n";
		}
		$flush();

		$html = wp_kses( $html, self::allowed_html() );
		return str_replace( '[', '&#91;', $html );
	}

	public static function allowed_html() {
		return array(
			'p'          => array(),
			'br'         => array(),
			'strong'     => array(),
			'em'         => array(),
			'del'        => array(),
			'code'       => array(),
			'pre'        => array(),
			'blockquote' => array(),
			'ul'         => array(),
			'ol'         => array(),
			'li'         => array(),
			'h3'         => array(),
			'h4'         => array(),
			'h5'         => array(),
			'hr'         => array(),
			'a'          => array(
				'href'   => true,
				'rel'    => true,
				'target' => true,
				'class'  => true,
			),
		);
	}

	private static function hold( $html ) {
		$key               = "\x01" . count( self::$ph ) . "\x02";
		self::$ph[ $key ]  = $html;
		return $key;
	}

	private static function ext_link( $url, $text_html ) {
		$url = esc_url( html_entity_decode( $url, ENT_QUOTES, 'UTF-8' ), array( 'http', 'https' ) );
		if ( '' === $url ) {
			return $text_html;
		}
		return '<a href="' . $url . '" rel="nofollow ugc noopener" target="_blank">' . $text_html . '</a>';
	}

	public static function inline( $text ) {
		self::$ph = array();
		$s = htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );

		// Inline code.
		$s = preg_replace_callback(
			'/`([^`]+)`/',
			function ( $m ) {
				return UTLC_Content::hold_public( '<code>' . $m[1] . '</code>' );
			},
			$s
		);
		// [text](url).
		$s = preg_replace_callback(
			'/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/i',
			function ( $m ) {
				return UTLC_Content::hold_public( UTLC_Content::ext_link_public( $m[2], $m[1] ) );
			},
			$s
		);
		// Bare URLs.
		$s = preg_replace_callback(
			'/\bhttps?:\/\/[^\s<>"\x01\x02]+/i',
			function ( $m ) {
				$url   = $m[0];
				$trail = '';
				while ( '' !== $url && preg_match( '/(?:[.,;:!?)\']|&quot;|&#039;|&gt;)$/', $url, $t ) ) {
					$trail = $t[0] . $trail;
					$url   = substr( $url, 0, -strlen( $t[0] ) );
				}
				if ( '' === $url ) {
					return $m[0];
				}
				return UTLC_Content::hold_public( UTLC_Content::ext_link_public( $url, $url ) ) . $trail;
			},
			$s
		);
		// r/slug and u/name.
		$s = preg_replace_callback(
			'/(^|[\s(])(r|u)\/([A-Za-z0-9_\-]{2,60})/u',
			function ( $m ) {
				$base = ( 'r' === $m[2] ) ? 'r' : 'u';
				$slug = ( 'r' === $base ) ? strtolower( $m[3] ) : $m[3];
				$url  = home_url( '/' . $base . '/' . rawurlencode( $slug ) . '/' );
				return $m[1] . UTLC_Content::hold_public( '<a class="utlc-mention" href="' . esc_url( $url ) . '">' . $base . '/' . esc_html( $m[3] ) . '</a>' );
			},
			$s
		);
		// Emphasis.
		$s = preg_replace( '/\*\*(?=\S)(.+?)(?<=\S)\*\*/u', '<strong>$1</strong>', $s );
		$s = preg_replace( '/(?<![*\w])\*(?=\S)(.+?)(?<=\S)\*(?![*\w])/u', '<em>$1</em>', $s );
		$s = preg_replace( '/~~(?=\S)(.+?)(?<=\S)~~/u', '<del>$1</del>', $s );

		// Restore placeholders (may nest).
		for ( $i = 0; $i < 3 && false !== strpos( $s, "\x01" ); $i++ ) {
			$s = strtr( $s, self::$ph );
		}
		self::$ph = array();
		return $s;
	}

	public static function hold_public( $html ) {
		return self::hold( $html );
	}

	public static function ext_link_public( $url, $text_html ) {
		return self::ext_link( $url, $text_html );
	}

	public static function excerpt( $raw, $len = 160 ) {
		$t = (string) $raw;
		$t = preg_replace( '/```[\s\S]*?(```|$)/', ' ', $t );
		$t = preg_replace( '/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i', '$1', $t );
		$t = preg_replace( '/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/m', '', $t );
		$t = str_replace( array( '**', '~~', '`' ), '', $t );
		$t = wp_strip_all_tags( $t );
		$t = trim( preg_replace( '/\s+/u', ' ', $t ) );
		$len = max( 1, (int) $len );
		if ( function_exists( 'mb_strlen' ) && mb_strlen( $t, 'UTF-8' ) > $len ) {
			$t = rtrim( mb_substr( $t, 0, $len, 'UTF-8' ) ) . '…';
		} elseif ( ! function_exists( 'mb_strlen' ) && strlen( $t ) > $len * 3 ) {
			$t = substr( $t, 0, $len * 3 ) . '…';
		}
		return esc_html( $t );
	}

	public static function clean_title( $raw ) {
		$t = wp_check_invalid_utf8( (string) $raw );
		$t = preg_replace( '/[\x00-\x1F\x7F]/', ' ', $t );
		$t = trim( preg_replace( '/\s+/u', ' ', $t ) );
		if ( function_exists( 'mb_substr' ) ) {
			$t = mb_substr( $t, 0, 300, 'UTF-8' );
		} else {
			$t = substr( $t, 0, 900 );
		}
		return esc_html( $t );
	}

	public static function youtube_id( $url ) {
		$url = (string) $url;
		if ( preg_match( '~(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/|live/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})~i', $url, $m ) ) {
			return $m[1];
		}
		return '';
	}
}
