(() => {
  "use strict";

  // Mobile nav
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Menu";
    });
  }

  // Thanks page (no-JS fallback lands here)
  const refSlot = document.querySelector("[data-ref-from-query]");
  if (refSlot) {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref && /^[A-Z0-9-]{6,20}$/.test(ref)) refSlot.textContent = ref;
  }

  const form = document.getElementById("quote-form");
  if (!form) return;

  const maxFiles = Number(form.dataset.maxFiles);
  const maxBytes = Number(form.dataset.maxMb) * 1024 * 1024;
  const allowedExt = form.dataset.ext.split(",").map((e) => e.replace(".", "").toLowerCase());
  const errorsBox = document.getElementById("form-errors");
  const submitBtn = document.getElementById("submit-btn");
  const progress = document.getElementById("progress");
  const fileInput = document.getElementById("f-files");
  const fileList = document.getElementById("file-list");

  form.elements.submission_id.value = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  form.elements.started_at.value = String(Date.now());

  // Show only the fields that apply to the chosen service
  const conditional = [...form.querySelectorAll("[data-for]")];
  function applyService() {
    const service = form.querySelector('input[name="service"]:checked')?.value;
    for (const el of conditional) {
      const show = Boolean(service) && el.dataset.for.split(" ").includes(service);
      el.hidden = !show;
      el.querySelectorAll("input, select, textarea").forEach((i) => (i.disabled = !show));
    }
  }
  const preset = new URLSearchParams(location.search).get("service");
  const presetInput = preset && form.querySelector(`input[name="service"][value="${CSS.escape(preset)}"]`);
  if (presetInput) presetInput.checked = true;
  form.querySelectorAll('input[name="service"]').forEach((r) => r.addEventListener("change", applyService));
  applyService();

  // Safety note
  form.querySelectorAll("[data-warn]").forEach((box) => {
    const note = document.getElementById(box.dataset.warn);
    box.addEventListener("change", () => (note.hidden = !box.checked));
  });

  // File list and checks
  const fmt = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
  function fileProblems() {
    const files = [...fileInput.files];
    const problems = [];
    if (files.length > maxFiles) problems.push(`Choose up to ${maxFiles} files. You've chosen ${files.length}.`);
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > maxBytes) problems.push(`Files add up to ${fmt(total)}. The limit is ${form.dataset.maxMb} MB, so leave some out and mention them in the description.`);
    for (const f of files) {
      const ext = f.name.split(".").pop().toLowerCase();
      if (!allowedExt.includes(ext)) problems.push(`${f.name} isn't an accepted file type.`);
      if (f.size === 0) problems.push(`${f.name} is empty.`);
    }
    return problems;
  }
  fileInput.addEventListener("change", () => {
    fileList.replaceChildren(
      ...[...fileInput.files].map((f) => {
        const li = document.createElement("li");
        const ext = f.name.split(".").pop().toLowerCase();
        if (!allowedExt.includes(ext) || f.size === 0) li.className = "bad";
        const name = document.createElement("span");
        name.textContent = f.name;
        const size = document.createElement("span");
        size.className = "size";
        size.textContent = fmt(f.size);
        li.append(name, size);
        return li;
      })
    );
  });

  function showErrors(list) {
    errorsBox.replaceChildren();
    const p = document.createElement("p");
    p.textContent = list.length === 1 ? "Fix this before sending:" : "Fix these before sending:";
    const ul = document.createElement("ul");
    for (const msg of list) {
      const li = document.createElement("li");
      li.textContent = msg;
      ul.append(li);
    }
    errorsBox.append(p, ul);
    errorsBox.hidden = false;
    errorsBox.focus();
  }

  function clientCheck() {
    const problems = [];
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    const mark = (name) => form.elements[name] && form.elements[name].setAttribute?.("aria-invalid", "true");
    if (!form.querySelector('input[name="service"]:checked')) problems.push("Choose what you need at the top of the form.");
    if (form.elements.description.value.trim().length < 10) { problems.push("Describe the part in a sentence or two."); mark("description"); }
    if (!form.elements.name.value.trim()) { problems.push("Enter your name."); mark("name"); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.elements.email.value.trim())) { problems.push("Enter a valid email address."); mark("email"); }
    if (!form.elements.consent.checked) problems.push("Tick the box to agree to the privacy policy and terms.");
    return problems.concat(fileProblems());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const problems = clientCheck();
    if (problems.length) return showErrors(problems);
    errorsBox.hidden = true;

    const data = new FormData(form);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", form.action);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.responseType = "json";
    submitBtn.disabled = true;
    progress.hidden = false;
    progress.textContent = "Sending…";
    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable && fileInput.files.length) progress.textContent = `Uploading ${Math.round((ev.loaded / ev.total) * 100)}%`;
    });
    xhr.addEventListener("load", () => {
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        form.hidden = true;
        document.getElementById("done-ref").textContent = body.ref;
        if (!body.emailed) document.getElementById("done-email-note").textContent = "Keep this reference in case you need to follow up.";
        const done = document.getElementById("form-done");
        done.hidden = false;
        done.focus();
        window.scrollTo({ top: done.getBoundingClientRect().top + window.scrollY - 24 });
        return;
      }
      submitBtn.disabled = false;
      progress.hidden = true;
      showErrors(body.errors && body.errors.length ? body.errors : [`The enquiry didn't go through (error ${xhr.status}). Try again in a minute.`]);
      if (window.turnstile) window.turnstile.reset();
    });
    xhr.addEventListener("error", () => {
      submitBtn.disabled = false;
      progress.hidden = true;
      showErrors(["The enquiry couldn't be sent. Check your connection and try again. Nothing you've typed has been lost."]);
    });
    xhr.send(data);
  });
})();
