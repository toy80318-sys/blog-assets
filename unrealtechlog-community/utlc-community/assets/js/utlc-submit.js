/* UTL Community - submit form (vanilla JS) */
(function () {
	'use strict';

	var form = document.querySelector('.utlc-submit-form');
	if (!form) { return; }

	var kindInput = form.querySelector('[data-utlc-kind-input]');
	var boardSel = form.querySelector('[data-utlc-board-select]');
	var flairSel = form.querySelector('[data-utlc-flair-select]');
	var fileInput = form.querySelector('[data-utlc-images]');
	var previews = form.querySelector('[data-utlc-previews]');
	var maxImages = parseInt(form.getAttribute('data-max-images'), 10) || 10;
	var maxMb = parseInt(form.getAttribute('data-max-mb'), 10) || 10;

	function toast(msg, type) { if (window.UTLC && window.UTLC.toast) { window.UTLC.toast(msg, type); } else { window.alert(msg); } }

	function setKind(kind) {
		kindInput.value = kind;
		form.querySelectorAll('[data-utlc-kind]').forEach(function (b) {
			b.classList.toggle('is-active', b.getAttribute('data-utlc-kind') === kind);
		});
		form.querySelectorAll('[data-utlc-panel]').forEach(function (p) {
			var kinds = p.getAttribute('data-utlc-panel').split(/\s+/);
			var show = kinds.indexOf(kind) !== -1;
			p.hidden = !show;
			// Disable controls in hidden panels so required fields don't block submit.
			p.querySelectorAll('input, select, textarea, button').forEach(function (el) {
				if (show) {
					if (el.hasAttribute('data-utlc-was-disabled')) { el.removeAttribute('data-utlc-was-disabled'); el.disabled = false; }
				} else if (!el.disabled) {
					el.setAttribute('data-utlc-was-disabled', '1');
					el.disabled = true;
				}
			});
		});
	}

	function applyBoard() {
		if (!boardSel) { return; }
		var opt = boardSel.options[boardSel.selectedIndex];
		if (!opt) { return; }
		var isMarket = opt.getAttribute('data-type') === 'market';
		form.querySelectorAll('[data-utlc-kind]').forEach(function (b) {
			var k = b.getAttribute('data-utlc-kind');
			b.hidden = isMarket ? (k !== 'model') : (k === 'model');
		});
		if (isMarket) {
			setKind('model');
		} else if (kindInput.value === 'model') {
			setKind('text');
		} else {
			setKind(kindInput.value || 'text');
		}
		if (flairSel) {
			var flairs = [];
			try { flairs = JSON.parse(opt.getAttribute('data-flairs') || '[]') || []; } catch (err) { flairs = []; }
			var cur = flairSel.value || flairSel.getAttribute('data-current') || '';
			flairSel.innerHTML = '';
			var none = document.createElement('option');
			none.value = '';
			none.textContent = '없음';
			flairSel.appendChild(none);
			flairs.forEach(function (f) {
				var o = document.createElement('option');
				o.value = f;
				o.textContent = f;
				if (f === cur) { o.selected = true; }
				flairSel.appendChild(o);
			});
		}
	}

	form.addEventListener('click', function (e) {
		var b = e.target.closest ? e.target.closest('[data-utlc-kind]') : null;
		if (!b) { return; }
		e.preventDefault();
		setKind(b.getAttribute('data-utlc-kind'));
	});

	if (boardSel) { boardSel.addEventListener('change', applyBoard); }

	if (fileInput && previews) {
		fileInput.addEventListener('change', function () {
			previews.innerHTML = '';
			var files = Array.prototype.slice.call(fileInput.files || []);
			if (files.length > maxImages) {
				toast('이미지는 최대 ' + maxImages + '장까지 올릴 수 있습니다.', 'error');
			}
			files.forEach(function (f) {
				if (f.size > maxMb * 1024 * 1024) {
					toast(f.name + ': ' + maxMb + 'MB를 초과합니다.', 'error');
				}
				if (!/^image\/(jpeg|png|gif|webp)$/.test(f.type)) { return; }
				var img = document.createElement('img');
				img.alt = f.name;
				img.style.maxWidth = '120px';
				img.style.maxHeight = '120px';
				img.style.objectFit = 'cover';
				img.style.margin = '4px';
				img.style.borderRadius = '6px';
				img.src = URL.createObjectURL(f);
				img.onload = function () { URL.revokeObjectURL(img.src); };
				previews.appendChild(img);
			});
		});
	}

	form.addEventListener('submit', function (e) {
		var title = form.querySelector('[name="utlc_title"]');
		if (title && title.value.trim().length < 2) {
			e.preventDefault();
			toast('제목은 2자 이상 입력해 주세요.', 'error');
			return;
		}
		var kind = kindInput.value;
		if (kind === 'link') {
			var url = form.querySelector('[name="utlc_url"]');
			if (url && !/^https?:\/\//i.test(url.value.trim())) {
				e.preventDefault();
				toast('올바른 http(s) 링크를 입력해 주세요.', 'error');
				return;
			}
		}
		if (fileInput && !fileInput.disabled && fileInput.files && fileInput.files.length > maxImages) {
			e.preventDefault();
			toast('이미지는 최대 ' + maxImages + '장까지 올릴 수 있습니다.', 'error');
			return;
		}
		var btn = form.querySelector('[data-utlc-submit-btn]');
		if (btn) {
			window.setTimeout(function () { btn.disabled = true; btn.textContent = '업로드 중…'; }, 0);
		}
	});

	applyBoard();
})();
