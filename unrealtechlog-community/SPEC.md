# UTL Community — 설계서 (Reddit형 커뮤니티 + 3D 모델 마켓, WordPress 플러그인)

Target: unrealtechlog.com (self-hosted WordPress on Cafe24, classic theme, Yoast + Rank Math active).
Plugin dir: `unrealtechlog-community/utlc-community/` → zipped and uploaded via wp-admin.
PHP 7.4+ compatible (no enums/readonly/match/nullsafe/named args/str_contains), WP 6.0+.
All UI text Korean. Prefix `utlc_` / classes `UTLC_`. Escape all output (esc_html/esc_attr/esc_url/wp_kses).
Every state-changing request: nonce + capability/login check. All SQL through `$wpdb->prepare`.

## Hard rules
- **Existing blog posts must survive unchanged** (post type `post`, URLs, content, comments, media). Never delete/modify media or post content. We only ADD a `utlc_board` term + `_utlc_score/_utlc_hot` meta to them.
- The site's media library is hot-linked by other blogs → never touch `wp-content/uploads` existing files.

## File layout / ownership
```
utlc-community.php                 [A] bootstrap: header, constants, requires, activation hooks
includes/helpers.php              [A] shared helper functions (list below)
includes/class-utlc-install.php    [A] tables, default boards, backfill legacy posts, flush rewrites
includes/class-utlc-core.php       [A] CPT utlc_post, taxonomy utlc_board, permalinks, votes, boards, feed, legacy hooks
includes/class-utlc-router.php     [B] rewrites, query vars, template routing, titles/robots, asset enqueue
templates/*.php, templates/parts/*.php [B] (except the ones owned by D)
assets/css/utlc.css, assets/js/utlc.js   [B]
includes/class-utlc-content.php    [C] markdown-lite renderer/sanitizer
includes/class-utlc-submit.php     [C] post create/edit/delete, image upload, submit form render
includes/class-utlc-comments.php   [C] comment tree render + AJAX add/delete
includes/class-utlc-accounts.php   [C] join (signup) + login page helpers, report + moderation AJAX
assets/js/utlc-comments.js, assets/js/utlc-submit.js [C]
includes/class-utlc-market.php     [D] listing fields/validation/storage, buy box, download, profile tabs
includes/class-utlc-orders.php     [D] orders/payouts DB + gateways (free, bank, toss)
templates/order.php, assets/js/utlc-market.js [D]
includes/admin/class-utlc-admin.php[E] admin menu, settings page, board term meta UI, dashboard + 기존 데이터 점검, orders/payouts screens
assets/css/utlc-admin.css          [E]
```

## Constants / options (A)
`UTLC_VERSION='1.0.0'`, `UTLC_DB_VERSION='1'`, `UTLC_FILE`, `UTLC_DIR` (trailing slash), `UTLC_URL` (trailing slash).
Option `utlc_settings` (array) merged over `utlc_default_settings()`:
```
community_name '언리얼테크로그 커뮤니티', front_page 1, legacy_board 'techlog', category_map array(),
legacy_vote_bar 1, posts_per_page 20, post_rate_per_hour 10, comment_rate_per_hour 60,
image_max_mb 10, images_per_post 10, market_review 1, commission_rate 20,
model_max_mb 200, model_extensions 'zip,7z,rar,fbx,obj,glb,gltf,blend,uasset,umap,usd,usdz,stl,abc,ma,mb,max,c4d,3ds,dae,ply,spp,sbsar',
min_price 1000, max_price 5000000, gateway_bank 1, bank_name '', bank_account '', bank_holder '',
gateway_toss 0, toss_client_key '', toss_secret_key '', min_payout 10000,
market_notice '언리얼테크로그는 통신판매중개자이며 통신판매의 당사자가 아닙니다. 상품 정보 및 거래에 대한 책임은 판매자에게 있습니다.',
refund_notice '디지털 콘텐츠 특성상 다운로드 후에는 청약철회가 제한됩니다(전자상거래법 제17조 제2항 제5호).',
report_threshold 5
```

## Helpers (A, includes/helpers.php) — exact names
- `utlc_default_settings(): array`, `utlc_opt( $key )`, `utlc_settings(): array`
- `utlc_time_ago( $gmt_mysql ): string` ("3시간 전")
- `utlc_krw( $int ): string` ("12,000원", 0 → "무료")
- `utlc_community_url()` (front page → home_url('/') if front_page else home_url('/community/'))
- `utlc_board_url( $term )`, `utlc_post_url( $post )` (= get_permalink), `utlc_user_url( $user_or_id )` → `/u/{user_nicename}/`
- `utlc_submit_url( $term = null )` → `/submit/` or `/r/{slug}/submit/`; `utlc_login_url( $redirect = '' )` → `/login/?redirect_to=`; `utlc_join_url()` → `/join/`
- `utlc_avatar( $user_id, $size = 32 ): string` — initial-letter circle `<span class="utlc-avatar" style="--s:32px;--h:HUE">글</span>`
- `utlc_is_banned( $user_id ): bool` (user meta `_utlc_banned`)
- `utlc_rate_limited( $key, $max, $window_sec ): bool` — increments transient counter, true when exceeded
- `utlc_verify_ajax( $require_login = true )` — checks `check_ajax_referer('utlc_nonce','nonce')`, login, ban; on failure `wp_send_json_error(['message'=>...], 4xx)`
- `utlc_get_template_part( $slug, $args = array() )` — look in `{theme}/utlc-community/{slug}.php` then `UTLC_DIR.'templates/'.$slug.'.php'`; `extract($args)`
- `utlc_flash( $msg, $type = 'success' )` set (cookie `utlc_flash`, JSON, 60s) and `utlc_flash_get(): array|null` (read + clear)
- `utlc_client_ip(): string`

## Data model (A)
CPT `utlc_post`: public, show_ui, show_in_menu `'utlc-community'`, supports title/editor/author/comments/thumbnail, rewrite false, has_archive false, show_in_rest true, map_meta_cap.
Taxonomy `utlc_board` on `array('utlc_post','post')`: public, show_ui, show_admin_column, rewrite `array('slug'=>'r','with_front'=>false)` → `/r/{slug}/`.
Permalink for utlc_post (post_type_link): `home_url("/r/{board_slug}/comments/{ID}/{post_name}/")`.

Post meta: `_utlc_kind` text|image|link|model, `_utlc_url`, `_utlc_images` (array of attachment IDs), `_utlc_flair`, `_utlc_score`, `_utlc_ups`, `_utlc_downs`, `_utlc_hot` (float), `_utlc_pinned` '1', `_utlc_edited` (gmt mysql), `_utlc_report_count`.
Market meta (D): `_utlc_price` int, `_utlc_license` personal|commercial|cc0, `_utlc_formats` array, `_utlc_polycount`, `_utlc_engine_version`, `_utlc_features` array, `_utlc_file` array{path(rel to private dir),name,size,ext}, `_utlc_file_url` (external link alternative), `_utlc_preview_glb` (public URL), `_utlc_sales_count`, `_utlc_download_count`.
Comment meta: `_utlc_score`, `_utlc_deleted`. User meta: `_utlc_karma` int, `_utlc_board_member` (multiple rows, value=term_id), `_utlc_banned`.
Term meta (utlc_board): `utlc_type` general|market|official, `utlc_icon` (emoji), `utlc_color` (#hex), `utlc_rules` (text, one per line), `utlc_flairs` (comma text), `utlc_post_perm` members|admins, `utlc_order` int, `utlc_member_count` int.

Tables (dbDelta, `$wpdb->prefix`):
- `utlc_votes`(id PK, user_id, object_type varchar(10), object_id, value tinyint, created_at datetime; UNIQUE(user_id,object_type,object_id); KEY(object_type,object_id))
- `utlc_reports`(id, object_type, object_id, reporter_id, reason varchar(50), details text, status varchar(20) 'open', created_at; UNIQUE(reporter_id,object_type,object_id))
- `utlc_orders`(id, order_key varchar(64) UNIQUE, listing_id, buyer_id, seller_id, amount int, fee_amount int, seller_amount int, status varchar(20) 'pending'|'paid'|'cancelled'|'refunded'|'failed', gateway varchar(20), payment_key varchar(200), depositor varchar(100), note text, created_at, paid_at NULL, updated_at; KEY buyer(buyer_id,status), KEY seller(seller_id,status), KEY listing(listing_id))
- `utlc_payouts`(id, seller_id, amount int, status varchar(20) 'requested'|'paid'|'rejected', bank_info text, admin_note text, created_at, processed_at NULL)

Default boards (created on activation if missing):
| slug | name | type | icon | color | post_perm |
|---|---|---|---|---|---|
| free | 자유게시판 | general | 💬 | #ff4500 | members |
| qna | 질문·답변 | general | ❓ | #0079d3 | members |
| market | 모델 마켓 | market | 🛒 | #46a758 | members |
| techlog | 테크로그 (공식) | official | 📘 | #1a1a1b | admins |
Flairs: free "잡담,작품공유,정보,뉴스"; qna "질문,해결됨"; market "캐릭터,환경,소품,차량,머티리얼,기타".
Legacy: every published `post` without a utlc_board term gets `category_map[cat_id]` board or `legacy_board` (techlog). Hook `transition_post_status` keeps doing this for new blog posts.

## Core APIs (A, class UTLC_Core static methods — exact names)
- `UTLC_Core::hot( $score, $timestamp ): float` (Reddit formula, epoch 1134028003, /45000)
- `UTLC_Core::refresh_post_score( $post_id )`, `UTLC_Core::refresh_comment_score( $comment_id )`
- Boards: `boards(): WP_Term[]` (ordered by utlc_order), `board( $id_or_slug ): ?WP_Term`, `board_meta( $term, $key )` (with defaults), `post_board( $post ): ?WP_Term`, `can_post( $user_id, $term ): bool`, `can_moderate( $user_id, $term = null ): bool` (users with `moderate_comments`), `is_member( $user_id, $term_id ): bool`, `set_member( $user_id, $term_id, $join ): int` (returns member count), `flairs( $term ): array`, `rules( $term ): array`, `market_board(): ?WP_Term`
- Feed: `feed( array $args ): array{posts:WP_Post[], total:int, pages:int}` args `board_id, sort hot|new|top, t day|week|month|year|all, page, per_page, author_id, search, kind` — custom SQL over post_type IN (utlc_post, post), status publish, joined to utlc_board; hot order uses `COALESCE(_utlc_hot, TIMESTAMPDIFF(...)/45000)`; `pinned( $board_id ): WP_Post[]`
- Votes: `user_votes( $user_id, $type, array $ids ): array id=>value`, `vote( $user_id, $type, $id, $value ): array|WP_Error` → `['score'=>int,'user_vote'=>int]` (updates meta, hot, author karma; self vote ignored for karma)
- AJAX (A): `wp_ajax_utlc_vote` {object_type post|comment, object_id, value -1|0|1} → success {score,user_vote}; `wp_ajax_utlc_join` {board_id, join 1|0} → {joined, member_count}
- On new utlc_post created, submitter auto-upvotes (C calls `UTLC_Core::vote`).
- Legacy single post: if `legacy_vote_bar`, append vote bar + "커뮤니티 r/{board}에서 보기" link to `the_content` for `post` singular main query (render via `utlc_get_template_part('parts/vote', ...)`).
- `the_content` / `get_the_excerpt` / `comment_text` for utlc_post content ALWAYS go through `UTLC_Content::render()` / `UTLC_Content::excerpt()` (content stored as raw markdown-lite text; C implements the filters in class-utlc-content.php: swap at priority -1000, render at 10000).

## Routing (B, class UTLC_Router)
`UTLC_Router::add_rewrite_rules()` (static, called on init and by installer before flush):
- top `^r/([^/]+)/comments/([0-9]+)(?:/[^/]*)?/?$` → `index.php?post_type=utlc_post&p=$matches[2]`
- top `^r/([^/]+)/submit/?$` → `index.php?utlc_route=submit&utlc_board_slug=$matches[1]`
- top `^submit/?$` → utlc_route=submit; `^communities/?$` → communities; `^community/?$` → home; `^login/?$` → login; `^join/?$` → join
- top `^u/([^/]+)/?$` → `utlc_route=profile&utlc_user=$matches[1]` (tab via `?tab=posts|comments|listings|purchases|sales`)
- top `^checkout/([A-Za-z0-9_-]+)/?$` → `utlc_route=order&utlc_order=$matches[1]`
- top `^utlc-pay/([a-z0-9_]+)/(success|fail)/?$` → `utlc_route=pay&utlc_gateway=$1&utlc_result=$2`
- top `^utlc-download/([0-9]+)/?$` → `utlc_route=download&utlc_item=$1`
Query vars: utlc_route, utlc_board_slug, utlc_user, utlc_order, utlc_gateway, utlc_result, utlc_item. Feed params from `$_GET`: sort, t, pg, q.
template_redirect: `download` → `UTLC_Market::handle_download( $listing_id )`; `pay` → `UTLC_Orders::handle_return( $gateway, $result )` (both exit). submit requires login (redirect to utlc_login_url).
template_include: front page (if front_page opt) / community → home; is_tax utlc_board → board; is_singular utlc_post → single; routes → submit, communities, profile, login, join, order; 404 profile → notfound. Never 404 our valid routes (pre_handle_404). Titles via `pre_get_document_title` + `wpseo_title` + `rank_math/frontend/title`; noindex (wp_robots, wpseo_robots, rank_math/frontend/robots) for submit/login/join/order/profile private tabs/search.
Layout: `standalone` shell (`templates/layout.php`: `<!doctype html>`, wp_head, body_class, wp_body_open, topbar, left nav, main, right sidebar, wp_footer). Dequeue active theme's own styles on our pages. Hide admin bar for users without `edit_posts`.
Assets: handle `utlc` (css+js) on our pages and legacy single posts; `wp_localize_script('utlc','utlcData',{ajaxUrl,nonce:wp_create_nonce('utlc_nonce'),loggedIn,loginUrl,userId})`. Then `do_action('utlc_enqueue_assets', $view)` so C/D enqueue their JS (deps `array('utlc')`).
View context: `UTLC_Router::view()` returns array {route, board, post, user, sort, t, pg, q, tab}.

Templates (B) and what they call:
- home.php / board.php: board header (board.php), sort bar, `parts/post-card` loop from `UTLC_Core::feed()`, pagination (?pg=), right sidebar (board info + rules + join button / community intro + board list).
- single.php: full post: title, meta, flair, body `UTLC_Content::render()`, gallery (`_utlc_images`), link card / YouTube embed, if kind model → `UTLC_Market::render_box( $post )`; actions (share, report, delete/edit if owner or mod); comments → `UTLC_Comments::render( $post )`.
- submit.php → `UTLC_Submit::render_form( $board_or_null, $edit_post_or_null )` (edit via `?edit=ID`).
- profile.php: header (avatar, name, u/nicename, 가입일, 카르마) + tabs: posts (feed author_id), comments (`UTLC_Comments::render_user_comments($user)`), listings/purchases/sales → `UTLC_Market::render_profile_tab( $tab, $user )` (purchases/sales only for self).
- communities.php (board grid + join), login.php (`wp_login_form`), join.php → `UTLC_Accounts::render_join_form()`, notfound.php. order.php is D's.
- parts/post-card.php (vote column left; meta: icon r/slug · u/author · time · flair · 📌; title; excerpt/thumbnail/link domain/price badge via `UTLC_Market::price_badge($post)` for model; footer: 💬 N 댓글, 공유), parts/vote.php args (type, id, score, user_vote, horizontal bool) markup: `<div class="utlc-vote" data-type data-id><button class="utlc-vote__up" data-utlc-vote="1">▲</button><span class="utlc-vote__score">N</span><button class="utlc-vote__down" data-utlc-vote="-1">▼</button></div>`.

Design system CSS classes (B defines in utlc.css; C/D must reuse): `.utlc-app` root, `.utlc-card`, `.utlc-btn` (+ `--primary`, `--ghost`, `--danger`, `--sm`), `.utlc-field` (label + control), `.utlc-input`, `.utlc-textarea`, `.utlc-select`, `.utlc-check`, `.utlc-tabs` / `.utlc-tab.is-active`, `.utlc-badge`, `.utlc-alert` (+`--error`,`--success`,`--info`), `.utlc-table`, `.utlc-grid`, `.utlc-stat`, `.utlc-modal` (`[hidden]` toggled) + `.utlc-modal__dialog`, `.utlc-muted`, `.utlc-avatar`. Reddit look: accent #ff4500, upvote #ff4500, downvote #7193ff, bg #f6f7f8 (dark mode via prefers-color-scheme), cards white, radius 8px, Pretendard/system font. Mobile-first; left nav ≥1200px, right sidebar ≥960px, drawer on mobile.
utlc.js exposes `window.UTLC = { ajax(action, data) → Promise<json>, toast(msg), requireLogin() }` and handles `[data-utlc-vote]`, `[data-utlc-join]`, `[data-utlc-share]`, `[data-utlc-report]` (opens prompt → `utlc_report`), `[data-utlc-delete-post]` (confirm → `utlc_delete_post`), nav drawer, `[data-utlc-modal-open="id"]`/`[data-utlc-modal-close]`.

## Content / submit / comments / accounts (C)
- `UTLC_Content::render( $raw ): string` — escape-first markdown-lite: fenced ``` code ```, `inline code`, # / ## / ### → h3/h4/h5, > quote, - / 1. lists, --- hr, **bold**, *italic*, ~~del~~, [text](http url), bare URL autolink (rel="nofollow ugc noopener" target=_blank), r/slug & u/name links, paragraphs + `<br>`. Final `wp_kses` whitelist, `[` → `&#91;` (no shortcodes). `UTLC_Content::excerpt( $raw, $len = 160 )` (plain, escaped). `UTLC_Content::clean_title( $raw )` → trimmed ≤300 chars stored as `esc_html()` (entities, no raw `<`). `UTLC_Content::youtube_id( $url )`.
- Store raw text: disable kses around wp_insert_post / wp_insert_comment for our content (kses_remove_filters()/kses_init_filters()), output only via render().
- `UTLC_Submit::render_form( $board, $edit_post )`: multipart POST to `admin-post.php`, action `utlc_submit_post`, nonce `wp_nonce_field('utlc_submit','utlc_submit_nonce')`, fields: utlc_board (select of boards user can_post), utlc_kind (tabs text|image|link, + model only when board type market — market board forces model), utlc_title, utlc_body, utlc_url, utlc_flair, `utlc_images[]` (multiple), honeypot `utlc_hp`, utlc_edit. For model kind it fires `do_action('utlc_submit_model_fields', $edit_post)` (D renders fields).
- Handler `admin_post_utlc_submit_post` (+nopriv → login redirect): nonce, login, ban, can_post, rate limit (post_rate_per_hour), honeypot, handle post_max_size overflow (empty $_POST). Validation: title 2–300, body ≤ 40000; link needs http(s) URL; image kind needs ≥1 image; model kind: `$ok = apply_filters('utlc_validate_model', true, $edit_post)` (WP_Error aborts) and ≥1 image. Status `apply_filters('utlc_new_post_status','publish',$kind,$board,$user_id)` (D returns 'pending' for model when market_review and user lacks edit_others_posts). Insert, set board term, meta, images (wp_handle_upload jpg/png/gif/webp ≤ image_max_mb, count ≤ images_per_post, attach, first = thumbnail), then for model `$saved = apply_filters('utlc_save_model', true, $post_id, $is_edit)` (WP_Error → delete new post, show error). Auto upvote. Redirect to post (pending → profile with flash "심사 후 공개됩니다"). Errors → redirect back with `utlc_flash(msg,'error')`.
- AJAX `utlc_delete_post` {post_id} (author or mod; model with paid orders → draft instead of trash), `utlc_report` {object_type, object_id, reason, details} (insert utlc_reports; ≥ report_threshold → post to pending / comment hold), `utlc_pin` {post_id, pin} (mods).
- `UTLC_Comments::render( $post )`: comment form (logged in) or login prompt + threaded approved comments (Reddit style: vote, 답글, 삭제, 신고, collapse; OP badge; `[삭제된 댓글입니다]` for `_utlc_deleted`), sort by score. `UTLC_Comments::render_user_comments( $user )`.
- AJAX `utlc_add_comment` {post_id, parent, body} → {html} (rate limit comment_rate_per_hour, post must be publish + comments open; auto-approved for logged-in non-banned users; stored raw), `utlc_delete_comment` {comment_id}.
- `UTLC_Accounts::render_join_form()` + handler `admin_post_nopriv_utlc_join` (users_can_register must be on; login [a-z0-9_]{3,20}, email, password ≥8 + confirm, display name, agree checkbox, honeypot, IP rate limit 5/h, `registration_errors` filter, wp_insert_user default_role, admin notification only, auto login, redirect with flash).

## Market (D)
- `UTLC_Market::private_dir()` = uploads basedir `/utlc-private` (override with constant `UTLC_PRIVATE_DIR`); ensure `.htaccess` (`Require all denied` + `Deny from all`), `index.php`, `web.config`. Files saved as `{Y}/{m}/{32hex}.dat`.
- Hooks: `utlc_submit_model_fields` (render fields: utlc_price, utlc_license, utlc_formats[], utlc_polycount, utlc_engine_version, utlc_features[], utlc_model_file (file) OR utlc_model_url (external download link, revealed only to buyers), utlc_preview_glb (optional public .glb ≤30MB, validated magic "glTF"), utlc_rights (required checkbox) — show `wp_max_upload_size()`), `utlc_validate_model`, `utlc_save_model`, `utlc_new_post_status`.
- `UTLC_Market::price_badge( $post )`, `UTLC_Market::render_box( $post )` (price, license, formats, polycount, engine, features, sales, seller, `<model-viewer>` preview if GLB (script `https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js` type=module), buttons: 구매하기 (opens modal: gateway radio free/bank/toss, depositor name for bank, refund notice agree checkbox) / 다운로드 (purchased, seller, admin) / login prompt; market_notice text).
- `UTLC_Market::handle_download( $listing_id )`: login, access (buyer with paid order, seller, admin), stream private file in chunks with `Content-Disposition: attachment; filename*=UTF-8''...` or redirect to `_utlc_file_url`; increment `_utlc_download_count`.
- `UTLC_Market::render_profile_tab( $tab, $user )`: listings (public), purchases (self: orders + download buttons + bank instructions + cancel pending), sales (self: balance cards, my listings with status, recent sales, payout request form `admin-post.php?action=utlc_payout_request`).
- `UTLC_Orders`: `create( $listing_id, $buyer_id, $gateway, $args )` (server-side price, fee=round(price*rate/100), buyer≠seller, not already paid; reuse same pending), `get( $id )`, `get_by_key( $key )`, `mark_paid( $order_id, $payment_key = '' )` (idempotent, sales_count++, emails, `do_action('utlc_order_paid')`), `set_status( $id, $status, $note )`, `has_purchased( $user_id, $listing_id )`, `for_buyer( $uid )`, `for_seller( $uid )`, `balance( $uid )` → earned/paid_out/pending/available, `request_payout(...)`, `gateways()` (free when price 0, bank, toss; filter `utlc_gateways`), `handle_return( $gateway, $result )`.
- AJAX `utlc_create_order` {listing_id, gateway, depositor, agree} → free: {type:'paid', download_url}; bank: {type:'redirect', url: /checkout/{key}/}; toss: {type:'toss', clientKey, customerKey, amount, orderId, orderName, successUrl, failUrl, customerEmail, customerName}. `utlc_cancel_order` {order_key} (buyer, pending only).
- Toss v2: JS `https://js.tosspayments.com/v2/standard` → `TossPayments(clientKey).payment({customerKey}).requestPayment({method:'CARD', amount:{currency:'KRW', value}, orderId, orderName, successUrl, failUrl, customerEmail, customerName})`. success: verify order pending/toss/buyer/amount match → `wp_remote_post('https://api.tosspayments.com/v1/payments/confirm', Basic base64(secret.':'), JSON {paymentKey, orderId, amount})`; status DONE → mark_paid; handle ALREADY_PROCESSED_PAYMENT by GET /v1/payments/{paymentKey}. fail → status failed. Refund: POST /v1/payments/{paymentKey}/cancel {cancelReason}.
- templates/order.php: order status page for buyer (bank account info + depositor + amount, or result).

## Admin (E)
Top menu `utlc-community` "커뮤니티" (dashicons-groups). Submenus: 개요 + 기존 데이터 점검 (counts: posts by status, pages, attachments, comments, users by role, categories with counts, utlc_post, boards; detect bbPress/BuddyPress/wpForo/KBoard/Asgaros/WooCommerce/EDD/Ultimate Member (class/const/table checks); legacy posts linked to boards count; health: pretty permalinks, users_can_register, upload_max_filesize/post_max_size/wp_max_upload_size, private dir protection files present; warning about hot-linked media; button "기존 글 게시판 연결 다시 적용" → `UTLC_Install::backfill_legacy()`), 게시판 (edit-tags link), 커뮤니티 글 (CPT), 판매 심사 (pending utlc_post in market), 주문 관리 (list + actions 입금확인 → `UTLC_Orders::mark_paid`, 취소, 환불 → set_status refunded (+Toss cancel API when gateway toss)), 정산 관리 (payout requests list + 지급완료/반려, seller balances), 신고 관리 (utlc_reports list + 숨김/무시), 설정 (Settings API over `utlc_settings`, sanitize every field; category→board mapping table). Board term meta fields on add/edit forms + columns. User profile: ban checkbox (admins). Admin notice when permalinks are plain.

## Previous community migration (A, in UTLC_Install) — IMPORTANT
The live site already contains an earlier custom community: post type `utl_item` (old URLs `?utl_item=ID`) with taxonomy `utl_community` (boards: free(13), questions, tutorials(7), showcase, jobs) — ~7 posts (IDs 27, 29, 203, 208, 213, 218, 223; draft 238). Its code may or may not still be active. Never reuse its names (hence our `utlc` prefix).
- `UTLC_Install::migrate_legacy_community()` (run on activation + admin button): find rows in `$wpdb->posts` with post_type `utl_item` (direct SQL, CPT may be unregistered). For each: `set_post_type( $id, 'utlc_post' )` (ID, content, comments, meta, status preserved), add meta `_utlc_migrated_from`='utl_item', `_utlc_format`='html', `_utlc_kind`='text', score/hot meta; map old `utl_community` term slug → new board: free→free, questions→qna, showcase→free (flair 작품공유), jobs→free, tutorials→techlog, anything else→free. Old term relationships are left untouched (reversible).
- Old URL redirects (template_redirect, priority 1): `?utl_item=ID` → 301 to `get_permalink(ID)` if it is now a published utlc_post; `?utl_community=slug` → 301 to the mapped board URL.
- Content format: `_utlc_format` = 'md' for posts/comments submitted through our frontend (raw markdown-lite, rendered by `UTLC_Content::render`). Any utlc_post WITHOUT `_utlc_format`='md' (migrated or created in wp-admin) is HTML and must be rendered with the normal WordPress pipeline (`apply_filters('the_content', ...)`). `UTLC_Content::render_post( $post ): string` picks the right path; the the_content swap filter only applies to 'md' posts. Comments submitted by us get comment meta `_utlc_format`='md'.
- Other facts: WP Super Cache + Yoast are active (logged-in users bypass cache; exclude `/utlc-pay/`, `/utlc-download/`, `/checkout/` from cache — document it). Only one existing user (admin "unrealtechlog").
