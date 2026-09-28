/* UTLC market: buy modal, Toss payments, order cancel. */
(function () {
	'use strict';

	var TOSS_SDK = 'https://js.tosspayments.com/v2/standard';

	function ajax(action, data) {
		if (window.UTLC && typeof window.UTLC.ajax === 'function') {
			return window.UTLC.ajax(action, data);
		}
		var cfg = window.utlcData || {};
		var body = new FormData();
		body.append('action', action);
		body.append('nonce', cfg.nonce || '');
		Object.keys(data || {}).forEach(function (k) { body.append(k, data[k]); });
		return fetch(cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body }).then(function (r) { return r.json(); });
	}

	function toast(msg) {
		if (window.UTLC && typeof window.UTLC.toast === 'function') { window.UTLC.toast(msg); } else { window.alert(msg); }
	}

	function unwrap(res) {
		if (res && res.success === false) {
			throw new Error((res.data && res.data.message) || '요청을 처리하지 못했습니다.');
		}
		return (res && res.success === true) ? res.data : res;
	}

	function loadToss() {
		return new Promise(function (resolve, reject) {
			if (window.TossPayments) { resolve(window.TossPayments); return; }
			var s = document.createElement('script');
			s.src = TOSS_SDK;
			s.async = true;
			s.onload = function () { window.TossPayments ? resolve(window.TossPayments) : reject(new Error('토스페이먼츠를 불러오지 못했습니다.')); };
			s.onerror = function () { reject(new Error('토스페이먼츠를 불러오지 못했습니다.')); };
			document.head.appendChild(s);
		});
	}

	function showError(form, msg) {
		var box = form.querySelector('.utlc-buy-error');
		if (box) { box.textContent = msg; box.hidden = false; } else { toast(msg); }
	}

	function toggleBank(form) {
		var checked = form.querySelector('input[name="gateway"]:checked');
		var bank = form.querySelector('[data-utlc-bank-only]');
		if (bank) { bank.hidden = !(checked && checked.value === 'bank'); }
	}

	document.addEventListener('change', function (e) {
		var t = e.target;
		if (t && t.name === 'gateway') {
			var form = t.closest('.utlc-buy-form');
			if (form) { toggleBank(form); }
		}
	});

	document.addEventListener('submit', function (e) {
		var form = e.target;
		if (!form || !form.classList || !form.classList.contains('utlc-buy-form')) { return; }
		e.preventDefault();

		if (window.utlcData && !window.utlcData.loggedIn) {
			if (window.UTLC && window.UTLC.requireLogin) { window.UTLC.requireLogin(); }
			return;
		}
		var gw = form.querySelector('input[name="gateway"]:checked');
		var dep = form.querySelector('input[name="depositor"]');
		var agree = form.querySelector('input[name="agree"]');
		if (!gw) { showError(form, '결제 수단을 선택하세요.'); return; }
		if (gw.value === 'bank' && dep && !dep.value.trim()) { showError(form, '입금자명을 입력하세요.'); dep.focus(); return; }
		if (agree && !agree.checked) { showError(form, '환불 규정에 동의해 주세요.'); return; }

		var btn = form.querySelector('button[type="submit"]');
		if (btn) { btn.disabled = true; }
		var box = form.querySelector('.utlc-buy-error');
		if (box) { box.hidden = true; }

		ajax('utlc_create_order', {
			listing_id: form.getAttribute('data-listing'),
			gateway: gw.value,
			depositor: dep ? dep.value.trim() : '',
			agree: agree && agree.checked ? 1 : 0
		}).then(unwrap).then(function (d) {
			if (d.type === 'paid') {
				toast('다운로드를 시작합니다.');
				window.location.href = d.download_url;
				setTimeout(function () { window.location.reload(); }, 2500);
				return null;
			}
			if (d.type === 'redirect') {
				window.location.href = d.url;
				return null;
			}
			if (d.type === 'toss') {
				return loadToss().then(function (TossPayments) {
					var payment = TossPayments(d.clientKey).payment({ customerKey: d.customerKey });
					return payment.requestPayment({
						method: 'CARD',
						amount: { currency: 'KRW', value: d.amount },
						orderId: d.orderId,
						orderName: d.orderName,
						successUrl: d.successUrl,
						failUrl: d.failUrl,
						customerEmail: d.customerEmail,
						customerName: d.customerName
					});
				});
			}
			throw new Error('알 수 없는 응답입니다.');
		}).catch(function (err) {
			var msg = (err && err.code === 'USER_CANCEL') ? '결제를 취소했습니다.' : ((err && err.message) || '오류가 발생했습니다.');
			showError(form, msg);
		}).then(function () {
			if (btn) { btn.disabled = false; }
		});
	});

	document.addEventListener('click', function (e) {
		var btn = e.target && e.target.closest ? e.target.closest('[data-utlc-cancel-order]') : null;
		if (!btn) { return; }
		e.preventDefault();
		if (!window.confirm('이 주문을 취소할까요?')) { return; }
		btn.disabled = true;
		ajax('utlc_cancel_order', { order_key: btn.getAttribute('data-utlc-cancel-order') })
			.then(unwrap)
			.then(function (d) {
				toast((d && d.message) || '주문이 취소되었습니다.');
				setTimeout(function () { window.location.reload(); }, 800);
			})
			.catch(function (err) {
				btn.disabled = false;
				toast((err && err.message) || '오류가 발생했습니다.');
			});
	});
})();
