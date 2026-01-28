import models from './models.json';

export function populateModelSelect(selectEl: HTMLSelectElement, selectedValue?: string) {
  // Clear existing options
  selectEl.innerHTML = '';

  // Add models from JSON
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    selectEl.appendChild(option);
  });

  // Add Custom option
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom...';
  selectEl.appendChild(customOption);

  // Set selected value if provided
  if (selectedValue) {
    selectEl.value = selectedValue;
  }
}
