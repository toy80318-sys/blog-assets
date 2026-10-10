/* UTL Community - comments (vanilla JS) */
(function () {
	'use strict';

	function U() { return window.UTLC || {}; }
	function toast(msg, type) { if (U().toast) { U().toast(msg, type); } else { window.alert(msg); } }
	function msgOf(res, fb) { return (res && res.data && (res.data.message || (typeof res.data === 'string' ? res.data : ''))) || fb; }
	function loggedIn() {
		if (U().requireLogin) { return U().requireLogin(); }
		return !!(window.utlcData && window.utlcData.loggedIn);
	}

	function formHtml(postId, parent) {
		var f = document.createElement('form');
		f.className = 'utlc-comment-form utlc-comment-form--reply';
		f.setAttribute('data-post-id', postId);
		f.setAttribute('data-parent', parent);
		f.innerHTML = '<textarea class="utlc-textarea" name="body" rows="3" maxlength="10000" required placeholder="답글을 입력하세요"></textarea>' +
			'<div class="utlc-comment-form__actions"><button type="button" class="utlc-btn utlc-btn--ghost utlc-btn--sm" data-utlc-reply-cancel>취소</button>' +
			'<button type="submit" class="utlc-btn utlc-btn--primary utlc-btn--sm">답글 달기</button></div>';
		return f;
	}

	function bumpCount(delta) {
		var el = document.querySelector('[data-utlc-comment-count]');
		if (!el) { return; }
		var n = parseInt(String(el.textContent).replace(/[^0-9]/g, ''), 10) || 0;
		el.textContent = String(Math.max(0, n + delta));
	}

	function toNode(html) {
		var t = document.createElement('div');
		t.innerHTML = html.trim();
		return t.firstElementChild;
	}

	document.addEventListener('submit', function (e) {
		var form = e.target;
		if (!form.classList || !form.classList.contains('utlc-comment-form')) { return; }
		e.preventDefault();
		if (!loggedIn()) { return; }
		var ta = form.querySelector('textarea[name="body"]');
		var body = ta ? ta.value.trim() : '';
		if (!body) { toast('내용을 입력해 주세요.', 'error'); return; }
		var btn = form.querySelector('button[type="submit"]');
		if (btn) { btn.disabled = true; }
		var parent = form.getAttribute('data-parent') || '0';
		U().ajax('utlc_add_comment', {
			post_id: form.getAttribute('data-post-id'),
			parent: parent,
			body: body
		}).then(function (res) {
			if (btn) { btn.disabled = false; }
			if (!res || !res.success || !res.data || !res.data.html) { toast(msgOf(res, '댓글을 등록하지 못했습니다.'), 'error'); return; }
			var node = toNode(res.data.html);
			if (parent !== '0') {
				var pc = document.getElementById('comment-' + parent);
				var kids = pc ? pc.querySelector('[data-utlc-children]') : null;
				if (kids) { kids.appendChild(node); }
				form.parentNode.removeChild(form);
			} else {
				var list = document.querySelector('[data-utlc-comment-list]');
				var empty = document.querySelector('[data-utlc-comments-empty]');
				if (empty) { empty.parentNode.removeChild(empty); }
				if (list) { list.insertBefore(node, list.firstChild); }
				ta.value = '';
			}
			bumpCount(1);
			if (node && node.scrollIntoView) { node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
			toast('댓글이 등록되었습니다.', 'success');
		});
	});

	document.addEventListener('click', function (e) {
		var t = e.target;
		if (!t || !t.closest) { return; }
		var el;

		if ((el = t.closest('[data-utlc-reply]'))) {
			e.preventDefault();
			if (!loggedIn()) { return; }
			var cid = el.getAttribute('data-utlc-reply');
			var c = document.getElementById('comment-' + cid);
			var slot = c ? c.querySelector('[data-utlc-reply-slot]') : null;
			if (!slot) { return; }
			if (slot.querySelector('form')) { slot.innerHTML = ''; return; }
			var sec = document.querySelector('.utlc-comments[data-post-id]');
			var f = formHtml(sec ? sec.getAttribute('data-post-id') : '', cid);
			slot.appendChild(f);
			f.querySelector('textarea').focus();
			return;
		}

		if ((el = t.closest('[data-utlc-reply-cancel]'))) {
			e.preventDefault();
			var form = el.closest('form');
			if (form && form.getAttribute('data-parent') !== '0') { form.parentNode.removeChild(form); }
			return;
		}

		if ((el = t.closest('[data-utlc-collapse]'))) {
			e.preventDefault();
			var cm = el.closest('.utlc-comment');
			if (!cm) { return; }
			var collapsed = cm.classList.toggle('is-collapsed');
			el.textContent = collapsed ? '[+]' : '[–]';
			var content = cm.querySelector(':scope > .utlc-comment__content');
			if (content) { content.hidden = collapsed; }
			return;
		}

		if ((el = t.closest('[data-utlc-delete-comment]'))) {
			e.preventDefault();
			if (!window.confirm('이 댓글을 삭제할까요?')) { return; }
			var id = el.getAttribute('data-utlc-delete-comment');
			U().ajax('utlc_delete_comment', { comment_id: id }).then(function (res) {
				if (!res || !res.success) { toast(msgOf(res, '삭제하지 못했습니다.'), 'error'); return; }
				var node = document.getElementById('comment-' + id);
				if (node) {
					if (res.data && res.data.soft) {
						node.classList.add('is-deleted');
						var b = node.querySelector('.utlc-comment__body');
						if (b) { b.innerHTML = '<p class="utlc-muted">[삭제된 댓글입니다]</p>'; }
						var a = node.querySelector('.utlc-comment__actions');
						if (a) { a.parentNode.removeChild(a); }
					} else {
						node.parentNode.removeChild(node);
					}
				}
				bumpCount(-1);
				toast('댓글이 삭제되었습니다.', 'success');
			});
			return;
		}

		if ((el = t.closest('[data-utlc-pin]'))) {
			e.preventDefault();
			var pin = el.getAttribute('data-pin') === '1' ? 1 : 0;
			U().ajax('utlc_pin', { post_id: el.getAttribute('data-utlc-pin'), pin: pin }).then(function (res) {
				if (!res || !res.success) { toast(msgOf(res, '처리하지 못했습니다.'), 'error'); return; }
				toast(msgOf(res, '완료되었습니다.'), 'success');
				window.setTimeout(function () { window.location.reload(); }, 600);
			});
		}
	});

	// Highlight linked comment.
	if (window.location.hash && /^#comment-\d+$/.test(window.location.hash)) {
		var target = document.querySelector(window.location.hash);
		if (target) { target.classList.add('is-highlight'); }
	}
})();
