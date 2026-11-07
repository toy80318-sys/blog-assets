/* UTL Community - core frontend (vanilla JS) */
(function () {
	'use strict';

	var D = window.utlcData || {};

	function ajax(action, data) {
		var fd;
		if (data instanceof FormData) {
			fd = data;
		} else {
			fd = new FormData();
			if (data) {
				Object.keys(data).forEach(function (k) {
					var v = data[k];
					if (Array.isArray(v)) {
						v.forEach(function (x) { fd.append(k + '[]', x); });
					} else if (v !== undefined && v !== null) {
						fd.append(k, v);
					}
				});
			}
		}
		fd.set('action', action);
		if (!fd.has('nonce')) { fd.append('nonce', D.nonce || ''); }
		return fetch(D.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' })
			.then(function (r) {
				return r.json().catch(function () {
					return { success: false, data: { message: '서버 응답을 처리할 수 없습니다. (' + r.status + ')' } };
				});
			})
			.catch(function () {
				return { success: false, data: { message: '네트워크 오류가 발생했습니다.' } };
			});
	}

	function errMsg(res, fallback) {
		if (res && res.data) {
			if (typeof res.data === 'string') { return res.data; }
			if (res.data.message) { return res.data.message; }
		}
		return fallback || '요청을 처리하지 못했습니다.';
	}

	var toastBox = null;
	function toast(msg, type) {
		if (!toastBox) {
			toastBox = document.createElement('div');
			toastBox.className = 'utlc-toasts';
			toastBox.setAttribute('aria-live', 'polite');
			document.body.appendChild(toastBox);
		}
		var el = document.createElement('div');
		el.className = 'utlc-toast' + (type ? ' utlc-toast--' + type : '');
		el.textContent = msg;
		toastBox.appendChild(el);
		setTimeout(function () { el.classList.add('is-hiding'); }, 2600);
		setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 3000);
	}

	/** Returns true when logged in; otherwise sends the user to the login page and returns false. */
	function requireLogin() {
		if (D.loggedIn) { return true; }
		toast('로그인이 필요합니다.');
		setTimeout(function () { window.location.href = D.loginUrl || '/login/'; }, 500);
		return false;
	}

	window.UTLC = { ajax: ajax, toast: toast, requireLogin: requireLogin, data: D };

	/* ---------- Votes ---------- */
	function applyVote(wrap, value, score) {
		wrap.classList.toggle('is-up', value === 1);
		wrap.classList.toggle('is-down', value === -1);
		if (typeof score === 'number') {
			var s = wrap.querySelector('.utlc-vote__score');
			if (s) { s.textContent = score.toLocaleString('ko-KR'); }
		}
	}
	function currentVote(wrap) {
		return wrap.classList.contains('is-up') ? 1 : (wrap.classList.contains('is-down') ? -1 : 0);
	}
	function currentScore(wrap) {
		var s = wrap.querySelector('.utlc-vote__score');
		return s ? parseInt(String(s.textContent).replace(/[^0-9-]/g, ''), 10) || 0 : 0;
	}
	function onVote(btn) {
		var wrap = btn.closest('.utlc-vote');
		if (!wrap || wrap.dataset.busy === '1') { return; }
		if (!requireLogin()) { return; }
		var val = parseInt(btn.getAttribute('data-utlc-vote'), 10);
		var prev = currentVote(wrap);
		var prevScore = currentScore(wrap);
		var next = prev === val ? 0 : val;
		applyVote(wrap, next, prevScore - prev + next);
		wrap.dataset.busy = '1';
		ajax('utlc_vote', { object_type: wrap.dataset.type || 'post', object_id: wrap.dataset.id, value: next }).then(function (res) {
			wrap.dataset.busy = '';
			if (res && res.success && res.data) {
				applyVote(wrap, parseInt(res.data.user_vote, 10) || 0, parseInt(res.data.score, 10) || 0);
			} else {
				applyVote(wrap, prev, prevScore);
				toast(errMsg(res, '투표에 실패했습니다.'), 'error');
			}
		});
	}

	/* ---------- Join ---------- */
	function onJoin(btn) {
		if (!requireLogin()) { return; }
		var board = btn.getAttribute('data-board');
		var joined = btn.getAttribute('data-joined') === '1';
		btn.disabled = true;
		ajax('utlc_join', { board_id: board, join: joined ? 0 : 1 }).then(function (res) {
			btn.disabled = false;
			if (!res || !res.success) { toast(errMsg(res), 'error'); return; }
			var nowJoined = !!(res.data && (res.data.joined === true || res.data.joined === 1 || res.data.joined === '1'));
			document.querySelectorAll('[data-utlc-join][data-board="' + board + '"]').forEach(function (b) {
				b.setAttribute('data-joined', nowJoined ? '1' : '0');
				b.textContent = nowJoined ? '가입됨' : '가입하기';
				b.classList.toggle('is-joined', nowJoined);
				b.classList.toggle('utlc-btn--primary', !nowJoined);
				b.classList.toggle('utlc-btn--ghost', nowJoined);
			});
			if (res.data && typeof res.data.member_count !== 'undefined') {
				document.querySelectorAll('[data-utlc-member-count="' + board + '"]').forEach(function (el) {
					el.textContent = Number(res.data.member_count).toLocaleString('ko-KR');
				});
			}
			toast(nowJoined ? '게시판에 가입했습니다.' : '게시판에서 탈퇴했습니다.');
		});
	}

	/* ---------- Share ---------- */
	function copyText(text) {
		if (navigator.clipboard && window.isSecureContext) {
			return navigator.clipboard.writeText(text);
		}
		return new Promise(function (resolve, reject) {
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
			document.body.removeChild(ta);
		});
	}
	function onShare(btn) {
		var url = btn.getAttribute('data-utlc-share') || btn.getAttribute('data-url') || window.location.href;
		copyText(url).then(function () { toast('링크가 복사되었습니다.'); }, function () { window.prompt('아래 링크를 복사하세요.', url); });
	}

	/* ---------- Report ---------- */
	function onReport(btn) {
		if (!requireLogin()) { return; }
		var type = btn.getAttribute('data-utlc-report') || 'post';
		var id = btn.getAttribute('data-id');
		var reason = window.prompt('신고 사유를 입력해 주세요. (예: 스팸, 욕설, 저작권 침해)');
		if (reason === null) { return; }
		reason = reason.trim();
		if (!reason) { toast('신고 사유를 입력해 주세요.', 'error'); return; }
		ajax('utlc_report', { object_type: type, object_id: id, reason: reason.slice(0, 50), details: reason }).then(function (res) {
			if (res && res.success) {
				toast((res.data && res.data.message) || '신고가 접수되었습니다.');
				btn.disabled = true;
			} else {
				toast(errMsg(res, '신고에 실패했습니다.'), 'error');
			}
		});
	}

	/* ---------- Delete post ---------- */
	function onDeletePost(btn) {
		if (!window.confirm('이 게시글을 삭제하시겠습니까? 되돌릴 수 없습니다.')) { return; }
		btn.disabled = true;
		ajax('utlc_delete_post', { post_id: btn.getAttribute('data-utlc-delete-post') }).then(function (res) {
			if (res && res.success) {
				toast((res.data && res.data.message) || '삭제되었습니다.');
				var to = (res.data && res.data.redirect) || btn.getAttribute('data-redirect');
				setTimeout(function () { if (to) { window.location.href = to; } else { window.location.reload(); } }, 600);
			} else {
				btn.disabled = false;
				toast(errMsg(res, '삭제에 실패했습니다.'), 'error');
			}
		});
	}

	/* ---------- Drawer / modal / dropdown ---------- */
	function setDrawer(open) {
		document.documentElement.classList.toggle('utlc-drawer-open', open);
	}
	function openModal(id) {
		var m = document.getElementById(id);
		if (!m) { return; }
		m.hidden = false;
		document.documentElement.classList.add('utlc-modal-open');
		var f = m.querySelector('input, select, textarea, button');
		if (f) { try { f.focus(); } catch (e) {} }
	}
	function closeModal(m) {
		if (!m) { return; }
		m.hidden = true;
		if (!document.querySelector('.utlc-modal:not([hidden])')) {
			document.documentElement.classList.remove('utlc-modal-open');
		}
	}
	function closeDropdowns(except) {
		document.querySelectorAll('.utlc-dropdown.is-open').forEach(function (d) {
			if (d !== except) { d.classList.remove('is-open'); }
		});
	}

	document.addEventListener('click', function (e) {
		var t = e.target;
		if (!(t instanceof Element)) { return; }
		var el;

		if ((el = t.closest('[data-utlc-vote]'))) { e.preventDefault(); onVote(el); return; }
		if ((el = t.closest('[data-utlc-join]'))) { e.preventDefault(); onJoin(el); return; }
		if ((el = t.closest('[data-utlc-share]'))) { e.preventDefault(); onShare(el); return; }
		if ((el = t.closest('[data-utlc-report]'))) { e.preventDefault(); onReport(el); return; }
		if ((el = t.closest('[data-utlc-delete-post]'))) { e.preventDefault(); onDeletePost(el); return; }
		if ((el = t.closest('[data-utlc-drawer-toggle]'))) { e.preventDefault(); setDrawer(!document.documentElement.classList.contains('utlc-drawer-open')); return; }
		if (t.closest('[data-utlc-drawer-close]')) { setDrawer(false); return; }
		if ((el = t.closest('[data-utlc-modal-open]'))) { e.preventDefault(); openModal(el.getAttribute('data-utlc-modal-open')); return; }
		if ((el = t.closest('[data-utlc-modal-close]'))) { e.preventDefault(); closeModal(el.closest('.utlc-modal')); return; }
		if (t.classList.contains('utlc-modal')) { closeModal(t); return; }

		el = t.closest('[data-utlc-dropdown]');
		if (el) {
			e.preventDefault();
			var dd = el.closest('.utlc-dropdown') || el.parentNode;
			closeDropdowns(dd);
			dd.classList.toggle('is-open');
			return;
		}
		if (!t.closest('.utlc-dropdown')) { closeDropdowns(null); }
	});

	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape') { return; }
		setDrawer(false);
		closeDropdowns(null);
		document.querySelectorAll('.utlc-modal:not([hidden])').forEach(closeModal);
	});

	// Auto-hide flash message.
	document.addEventListener('DOMContentLoaded', function () {
		var f = document.querySelector('.utlc-flash');
		if (f) { setTimeout(function () { f.classList.add('is-hiding'); }, 6000); }
	});
})();
