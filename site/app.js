'use strict';
const service = document.querySelector('#service');
const printOptions = document.querySelector('#print-options');
const printMaterials = new Set(['replacement','mounts','printing','cad-print']);

function updateService() {
  const requiresMaterial = printMaterials.has(service.value);
  printOptions.hidden = !requiresMaterial;
  document.querySelector('#material').disabled = !requiresMaterial;
  document.querySelector('#colour').disabled = !requiresMaterial;
}
service.addEventListener('change', updateService);
document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  service.value = link.dataset.service;
  updateService();
}));
updateService();

document.querySelector('#year').textContent = new Date().getFullYear().toString();
const status = document.querySelector('#form-status');
document.querySelector('#quote-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  const nameFor = key => String(fields.get(key) || '').trim();
  const displayService = service.options[service.selectedIndex]?.textContent || 'Not selected';
  const lines = [
    'CUSTOM PARTS & CAD — ENQUIRY DRAFT',
    'Name: ' + nameFor('fullName'),
    'Email: ' + nameFor('email'),
    'Service: ' + displayService,
    'Location: ' + (nameFor('suburb') || 'Not provided'),
    'Quantity: ' + (nameFor('quantity') || '1'),
    'Deadline: ' + nameFor('deadline'),
  ];
  if (!printOptions.hidden) {
    lines.push('Material: ' + nameFor('material'));
    lines.push('Colour: ' + (nameFor('colour') || 'No preference'));
  }
  lines.push('', 'PROJECT DESCRIPTION', nameFor('details'), '', 'OTHER NOTES', nameFor('notes') || 'None');
  const files = [...document.querySelector('#attachments').files].map(file => file.name);
  if (files.length) lines.push('', 'SELECTED FILE NAMES (FILES NOT INCLUDED)', ...files);
  lines.push('', 'This is a draft generated from an offline frontend preview. It has not been submitted.');
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    status.textContent = 'Copied. The files themselves were not copied or uploaded. No request has been submitted.';
  } catch {
    status.textContent = 'Browser blocked clipboard access. Serve this site on localhost or HTTPS and retry.';
  }
});