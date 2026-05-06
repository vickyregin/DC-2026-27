import { Component, signal, ElementRef, ViewChild, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';

declare var html2canvas: any;
declare var jspdf: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  @ViewChild('challanForm') challanFormElement!: ElementRef;
  
  private platformId = inject(PLATFORM_ID);
  private readonly defaultCompanyName = 'Flashkart India Private Limited';
  private readonly defaultCompanyGstin = '33AADCF3120C1ZI';
  private readonly defaultTermsConditions = 'Goods once delivered will not be taken back.\nPlease check the goods at the time of delivery.\nSubject to local jurisdiction.';
  private readonly nonReturnableTermsConditions = 'Goods returns are accepted within the specified policy period, provided the items are not damaged.';
  readonly manualCompanyAddressValue = '__OTHER__';
  challanForm: FormGroup;
  isGeneratingPdf = signal(false);
  showValidationError = signal(false);
  invalidFieldsCount = signal(0);
  showJsonData = signal(false);
  formJsonData = signal<string>('');
  isSubmitting = signal(false);
  submitMessage = signal<{type: 'success' | 'error', text: string} | null>(null);
  isManualCompanyAddress = signal(false);
  today = new Date().toISOString().split('T')[0];

  // Login state
  isLoggedIn = signal(false);
  loginUsername = signal('');
  loginPassword = signal('');
  loginError = signal('');
  loggedInUser = signal('');

  // Google Sheet Apps Script URL - Replace with your deployed web app URL
  private googleSheetUrl = 'https://script.google.com/macros/s/AKfycbwAe-5-aaY8u0ZecerDvk8v5VbGWQorP7fI0AxutH6pvnmgcEaraF7XCviVmHtbalvRWQ/exec';

  // Valid username-password pairs
  private validCredentials: { [key: string]: string } = {
    'SASI': 'Sasi@2026',
    'SHARMILA': 'Accounts@2026'
  };

  challanTypes = [
    'RETURNABLE',
    'NON-RETURNABLE'
  ];

  companyAddresses = [
    {
      label: 'Sunguvarchatram - Warehouse',
      value: 'Sunguvarchatram Warehouse\nSF.NO 200/1B, Om Logistics Opp Side Road,\nSirumangadu, Sriperumbudur.\nPin – 602 106'
    },
    {
      label: 'Hosur - MHE',
      value: 'HOSUR - MHE\nSurvey No.113/4A, Mookandapalli Post, Inner Ring Road,\nMotham Agraharam, Hosur, Krishnagiri, Tamil Nadu - 635126'
    },
    {
      label: 'Kadigai - Warehouse',
      value: 'Kadigai Warehouse\nS.No 456/1A AND 456/1C,\nPANRUTTY KANDIGAI VILLAGE,SRIPERUMPUDUR,KANCHEEPURAM.TAMIL NADU,602105'
    }
  ];

  constructor(private fb: FormBuilder) {
    this.challanForm = this.fb.group({
      // Company Details
      companyName: [this.defaultCompanyName, [Validators.required, Validators.pattern(/^[a-zA-Z\s]*$/)]],
      companyAddressSelection: ['', Validators.required],
      companyAddress: ['', Validators.required],
      companyPhone: ['', [Validators.required, Validators.pattern(/^[0-9]*$/)]],
      companyEmail: ['', [Validators.required, Validators.email]],
      companyGstin: [this.defaultCompanyGstin],
      
      // Challan Info
      challanType: ['', Validators.required],
      challanNo: [this.generateChallanNo(), Validators.required],
      challanDate: [this.today, Validators.required],
      poNumber: [''],
      poDate: [''],
      
      // Consignee Details
      consigneeName: ['', Validators.required],
      consigneeAddress: ['', Validators.required],
      consigneePhone: ['', Validators.pattern(/^[0-9]*$/)],
      consigneeGstin: ['', Validators.required],
      
      // Transport Details
      transportMode: ['Road', Validators.required],
      vehicleNo: ['', Validators.required],
      driverName: ['', [Validators.required, Validators.pattern(/^[a-zA-Z\s]*$/)]],
      driverPhone: ['', [Validators.required, Validators.pattern(/^[0-9]*$/)]],
      ewayBillNo: [''],
      
      // Items
      items: this.fb.array([this.createItem()]),
      
      // Additional Info
      preparedBy: ['', Validators.required],
      remarks: [''],
      termsConditions: [this.defaultTermsConditions]
    });

    this.challanForm.get('challanType')?.valueChanges.subscribe((type) => {
      this.challanForm.patchValue({
        termsConditions: type === 'NON-RETURNABLE'
          ? this.nonReturnableTermsConditions
          : this.defaultTermsConditions
      }, { emitEvent: false });
    });

    this.challanForm.get('companyAddressSelection')?.valueChanges.subscribe((selectedAddress) => {
      this.isManualCompanyAddress.set(selectedAddress === this.manualCompanyAddressValue);
      this.challanForm.patchValue({
        companyAddress: selectedAddress === this.manualCompanyAddressValue ? '' : selectedAddress
      }, { emitEvent: false });
    });
  }

  // Login method
  signin(): void {
    const username = this.loginUsername().trim().toUpperCase();
    const password = this.loginPassword().trim();


    // Validate inputs
    if (!username || !password) {
      this.loginError.set('Please enter both username and password');
      return;
    }

    // Check if username exists and password matches
    if (!this.validCredentials[username] || this.validCredentials[username] !== password) {
      this.loginError.set('Invalid username or password. Please try again.');
      return;
    }

    // Login successful
    this.isLoggedIn.set(true);
    this.loggedInUser.set(username);
    this.loginError.set('');
    this.loginUsername.set('');
    this.loginPassword.set('');

    // Set preparedBy field to logged-in user
    this.challanForm.patchValue({
      companyName: this.defaultCompanyName,
      companyGstin: this.defaultCompanyGstin,
      preparedBy: username
    });
  }

  // Logout method
  logout(): void {
    this.isLoggedIn.set(false);
    this.loggedInUser.set('');
    this.loginUsername.set('');
    this.loginPassword.set('');
    this.loginError.set('');
    this.resetForm();
  }

  createItem(): FormGroup {
    return this.fb.group({
      slNo: [1],
      description: ['', Validators.required],
      hsnCode: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['Pcs', Validators.required],
      rate: [0, [Validators.required, Validators.min(0)]],
      gst: [0],
      amount: [0]
    });
  }

  get items(): FormArray {
    return this.challanForm.get('items') as FormArray;
  }

  addItem(): void {
    const newItem = this.createItem();
    newItem.patchValue({ slNo: this.items.length + 1 });
    this.items.push(newItem);
  }

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
      this.updateSlNumbers();
    }
  }

  updateSlNumbers(): void {
    this.items.controls.forEach((item, index) => {
      item.patchValue({ slNo: index + 1 });
    });
  }

  calculateAmount(index: number): void {
    const item = this.items.at(index);
    const quantity = item.get('quantity')?.value || 0;
    const rate = item.get('rate')?.value || 0;
    const gst = item.get('gst')?.value || 0;
    const baseAmount = quantity * rate;
    const gstAmount = (baseAmount * gst) / 100;
    item.patchValue({ amount: baseAmount + gstAmount });
  }

  onPhoneInput(event: any, controlName: string): void {
    const value = event.target.value.replace(/[^0-9]/g, '');
    this.challanForm.get(controlName)?.setValue(value);
  }

  onNameInput(event: any, controlName: string): void {
    const value = event.target.value.replace(/[^a-zA-Z\s]/g, '');
    this.challanForm.get(controlName)?.setValue(value);
  }

  get totalAmount(): number {
    return this.items.controls.reduce((sum, item) => {
      return sum + (item.get('amount')?.value || 0);
    }, 0);
  }

  get totalQuantity(): number {
    return this.items.controls.reduce((sum, item) => {
      return sum + (item.get('quantity')?.value || 0);
    }, 0);
  }

  generateChallanNo(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `DC-${year}${month}${day}-${random}`;
  }

  async generatePdf(): Promise<void> {
    if (this.challanForm.invalid) {
      console.log('Form is invalid, cannot generate PDF', this.challanForm);
      this.markFormGroupTouched();
      const count = this.countInvalidFields();
      this.invalidFieldsCount.set(count);
      this.showValidationError.set(true);
      setTimeout(() => this.showValidationError.set(false), 5000);
      
      // Scroll to first invalid field
      this.scrollToFirstInvalidField();
      return;
    }

    this.isGeneratingPdf.set(true);
    
    try {
      const element = document.getElementById('printArea');
      if (!element) {
        alert('Print area not found');
        return;
      }

      // Wait for any pending renders
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create and inject CSS overrides to replace oklch colors with hex equivalents
      const styleOverride = document.createElement('style');
      styleOverride.id = 'pdf-color-override';
      styleOverride.textContent = `
        #printArea { 
          color: #1f2937 !important;
          background-color: #ffffff !important; 
        }
        #printArea .bg-white { background-color: #ffffff !important; }
        #printArea .bg-gray-50 { background-color: #f9fafb !important; }
        #printArea .bg-gray-100 { background-color: #f3f4f6 !important; }
        
        /* Light gradient for challan details section */
        #printArea .from-indigo-50.to-purple-50,
        #printArea [class*="from-indigo-50"][class*="to-purple-50"] { 
          background: linear-gradient(to right, #eef2ff, #faf5ff) !important; 
        }
        #printArea .from-indigo-50.to-purple-50 *,
        #printArea [class*="from-indigo-50"][class*="to-purple-50"] * {
          color: #1f2937 !important;
        }
        #printArea .from-indigo-50.to-purple-50 input,
        #printArea .from-indigo-50.to-purple-50 select,
        #printArea [class*="from-indigo-50"] input,
        #printArea [class*="from-indigo-50"] select {
          color: #1f2937 !important;
          -webkit-text-fill-color: #1f2937 !important;
          background-color: #ffffff !important;
          border: 1px solid #e5e7eb !important;
        }
        #printArea .from-indigo-50.to-purple-50 .text-indigo-600,
        #printArea .from-indigo-50.to-purple-50 .font-mono,
        #printArea [class*="from-indigo-50"] .text-indigo-600,
        #printArea [class*="from-indigo-50"] .font-mono {
          color: #4f46e5 !important;
          -webkit-text-fill-color: #4f46e5 !important;
        }
        #printArea .from-indigo-50.to-purple-50 .text-indigo-700,
        #printArea .from-indigo-50.to-purple-50 label,
        #printArea [class*="from-indigo-50"] .text-indigo-700,
        #printArea [class*="from-indigo-50"] label {
          color: #4338ca !important;
        }
        
        /* Dark gradient - only for elements with from-indigo-600 (like DELIVERY CHALLAN badge) */
        #printArea .from-indigo-600.to-purple-600,
        #printArea [class*="from-indigo-600"][class*="to-purple-600"] { 
          background: linear-gradient(to right, #4f46e5, #7c3aed) !important; 
        }
        #printArea .from-indigo-600.to-purple-600 *,
        #printArea [class*="from-indigo-600"][class*="to-purple-600"] * {
          color: #ffffff !important;
        }
        
        #printArea .from-gray-700 { background-color: #374151 !important; }
        #printArea .text-white { color: #ffffff !important; }
        #printArea .text-gray-400 { color: #9ca3af !important; }
        #printArea .text-gray-500 { color: #6b7280 !important; }
        #printArea .text-gray-600 { color: #4b5563 !important; }
        #printArea .text-gray-700 { color: #374151 !important; }
        #printArea .text-gray-800 { color: #1f2937 !important; }
        #printArea .text-blue-600 { color: #2563eb !important; }
        #printArea .bg-blue-600 { background-color: #2563eb !important; }
        #printArea .text-indigo-600 { color: #4f46e5 !important; }
        #printArea .text-indigo-700 { color: #4338ca !important; }
        #printArea .text-purple-600 { color: #9333ea !important; }
        #printArea .text-red-500 { color: #ef4444 !important; }
        #printArea .text-green-600 { color: #16a34a !important; }
        #printArea .border-gray-100 { border-color: #f3f4f6 !important; }
        #printArea .border-gray-200 { border-color: #e5e7eb !important; }
        #printArea .border-gray-300 { border-color: #d1d5db !important; }
        #printArea .border-indigo-100 { border-color: #e0e7ff !important; }
        #printArea .divide-gray-100 > * + * { border-color: #f3f4f6 !important; }
        
        /* Table header with gradient - ensure white text */
        #printArea thead { background: linear-gradient(to right, #374151, #1f2937) !important; }
        #printArea thead * { color: #ffffff !important; }
        #printArea thead th { color: #ffffff !important; }
        
        #printArea .bg-indigo-100 { background-color: #e0e7ff !important; }
        #printArea .bg-purple-100 { background-color: #f3e8ff !important; }
        #printArea .bg-green-100 { background-color: #dcfce7 !important; }
        
        /* Fix text cut-off in form inputs */
        #printArea input, #printArea textarea, #printArea select { 
          background-color: #ffffff !important; 
          border-color: #e5e7eb !important;
          color: #1f2937 !important;
          overflow: visible !important;
          line-height: 1.5 !important;
          padding: 8px 12px !important;
          height: auto !important;
          min-height: 38px !important;
          font-size: 14px !important;
          box-sizing: border-box !important;
          -webkit-text-fill-color: #1f2937 !important;
        }
        #printArea textarea {
          min-height: auto !important;
          height: auto !important;
          white-space: pre-wrap !important;
          overflow: visible !important;
          resize: none !important;
        }
        #printArea .pdf-text-display {
          min-height: auto !important;
          height: auto !important;
          overflow: visible !important;
        }
        #printArea select {
          -webkit-appearance: none !important;
          appearance: none !important;
        }
        #printArea .font-mono { color: #4f46e5 !important; }
        
        /* Ensure table cells show content properly */
        #printArea table input, #printArea table select {
          padding: 8px 12px !important;
          min-height: 44px !important;
          font-size: 14px !important;
          white-space: nowrap !important;
          overflow: visible !important;
        }
      `;
      document.head.appendChild(styleOverride);

      // Convert form inputs to static text for proper PDF rendering
      // Store references to restore later
      const displaySpans: HTMLElement[] = [];
      const hiddenInputs: Array<{el: HTMLElement, display: string}> = [];
      const formElements = element.querySelectorAll('input, textarea, select');
      
      formElements.forEach((el) => {
        const htmlEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        
        // Get the value to display
        let displayValue = '';
        if (htmlEl.tagName === 'SELECT') {
          const select = htmlEl as HTMLSelectElement;
          // Always use the value for select elements (not the label/text)
          displayValue = select.value || '';
        } else {
          displayValue = htmlEl.value || '';
        }
        
        // Create a styled span to show alongside the input
        const span = document.createElement('div');
        span.className = 'pdf-text-display';
        span.style.cssText = `
          padding: 8px 12px;
          min-height: 36px;
          font-size: 14px;
          color: #1f2937;
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          display: flex;
          align-items: center;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
          box-sizing: border-box;
          width: 100%;
        `;
        
        // Special styling for certain inputs
        if (htmlEl.classList.contains('font-mono')) {
          span.style.fontFamily = 'monospace';
          span.style.fontWeight = '600';
          span.style.color = '#4f46e5';
        }
        if (htmlEl.tagName === 'TEXTAREA') {
          span.style.minHeight = 'auto';
          span.style.height = 'auto';
          span.style.alignItems = 'flex-start';
          span.style.padding = '10px 12px';
          span.style.whiteSpace = 'pre-wrap';
          span.style.overflow = 'visible';
          span.style.display = 'block';
        }
        if (htmlEl.classList.contains('text-center')) {
          span.style.justifyContent = 'center';
          span.style.textAlign = 'center';
        }
        if (htmlEl.classList.contains('text-right')) {
          span.style.justifyContent = 'flex-end';
          span.style.textAlign = 'right';
        }
        
        span.textContent = displayValue;
        
        // Hide the original input and insert span after it
        hiddenInputs.push({ el: htmlEl, display: htmlEl.style.display });
        htmlEl.style.display = 'none';
        htmlEl.parentElement?.insertBefore(span, htmlEl.nextSibling);
        displaySpans.push(span);
      });

      // Force a reflow to apply styles
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        ignoreElements: (el: Element) => (el as HTMLElement).classList?.contains('no-print')
      });
      
      // Restore original form inputs
      displaySpans.forEach(span => span.remove());
      hiddenInputs.forEach(({el, display}) => {
        el.style.display = display;
      });

      // Remove the style override
      styleOverride.remove();

      const imgData = canvas.toDataURL('image/png');
      
      // Access jsPDF from the global jspdf object
      const { jsPDF } = jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }
      
      const challanNo = this.challanForm.get('challanNo')?.value || 'DC';
      pdf.save(`${challanNo}.pdf`);

      const payload = this.buildSubmitPayload();
      const submitSuccess = await this.postToGoogleSheet(payload);

      if (submitSuccess) {
        this.submitMessage.set({ type: 'success', text: 'Data submitted and PDF saved successfully!' });
        this.resetForm();
      } else {
        this.submitMessage.set({ type: 'error', text: 'PDF saved, but submitting data to Google Sheet failed.' });
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + (error as Error).message);
      this.submitMessage.set({ type: 'error', text: 'Error generating PDF. Please try again.' });
    } finally {
      this.isGeneratingPdf.set(false);
      setTimeout(() => this.submitMessage.set(null), 5000);
    }
  }

  markFormGroupTouched(): void {
    Object.keys(this.challanForm.controls).forEach(key => {
      const control = this.challanForm.get(key);
      control?.markAsTouched();
      if (control instanceof FormArray) {
        control.controls.forEach(c => {
          if (c instanceof FormGroup) {
            Object.keys(c.controls).forEach(k => c.get(k)?.markAsTouched());
          }
        });
      }
    });
  }

  countInvalidFields(): number {
    let count = 0;
    Object.keys(this.challanForm.controls).forEach(key => {
      const control = this.challanForm.get(key);
      if (control?.invalid && !(control instanceof FormArray)) {
        count++;
      }
      if (control instanceof FormArray) {
        control.controls.forEach(c => {
          if (c instanceof FormGroup) {
            Object.keys(c.controls).forEach(k => {
              if (c.get(k)?.invalid) count++;
            });
          }
        });
      }
    });
    return count;
  }

  scrollToFirstInvalidField(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    setTimeout(() => {
      const firstInvalid = document.querySelector('.border-red-400') as HTMLElement;
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus();
      }
    }, 100);
  }

  resetForm(): void {
    this.challanForm.reset({
      companyName: this.defaultCompanyName,
      companyAddressSelection: '',
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
      companyGstin: this.defaultCompanyGstin,
      challanType: '',
      challanNo: this.generateChallanNo(),
      challanDate: this.today,
      poNumber: '',
      poDate: '',
      consigneeName: '',
      consigneeAddress: '',
      consigneePhone: '',
      consigneeGstin: '',
      transportMode: 'Road',
      vehicleNo: '',
      driverName: '',
      driverPhone: '',
      ewayBillNo: '',
      preparedBy: '',
      remarks: '',
      termsConditions: this.defaultTermsConditions
    });
    this.items.clear();
    this.items.push(this.createItem());
  }

  private buildSubmitPayload(): any {
    const { companyAddressSelection, ...formData } = this.challanForm.getRawValue();
    return {
      ...formData,
      items: JSON.stringify(formData.items),
      totalQuantity: this.totalQuantity,
      totalAmount: this.totalAmount,
      submittedAt: new Date().toISOString()
    };
  }

  private async postToGoogleSheet(payload: any): Promise<boolean> {
    try {
      await fetch(this.googleSheetUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log('Form submitted to Google Sheet:', payload);
      return true;
    } catch (error) {
      console.error('Error submitting to Google Sheet:', error);
      return false;
    }
  }

  submitForm(): void {
    const formData = this.challanForm.getRawValue();
    this.formJsonData.set(JSON.stringify(formData, null, 2));
    this.showJsonData.set(true);
    console.log('Form Data:', formData);
  }

  async submitToGoogleSheet(): Promise<void> {
    if (this.challanForm.invalid) {
      this.markFormGroupTouched();
      const count = this.countInvalidFields();
      this.invalidFieldsCount.set(count);
      this.showValidationError.set(true);
      setTimeout(() => this.showValidationError.set(false), 5000);
      this.scrollToFirstInvalidField();
      return;
    }

    this.isSubmitting.set(true);
    this.submitMessage.set(null);

    try {
      const payload = this.buildSubmitPayload();
      const success = await this.postToGoogleSheet(payload);

      if (success) {
        this.submitMessage.set({ type: 'success', text: 'Data submitted to Google Sheet successfully!' });
        this.formJsonData.set(JSON.stringify(payload, null, 2));

        const userChoice = confirm('Do you want to submit another DC copy or exit?\n\nClick "OK" to submit another DC copy\nClick "Cancel" to exit');
        if (userChoice) {
          this.resetForm();
        } else {
          window.close();
        }
      } else {
        this.submitMessage.set({ type: 'error', text: 'Failed to submit data. Please try again.' });
      }

    } catch (error) {
      console.error('Error submitting to Google Sheet:', error);
      this.submitMessage.set({ type: 'error', text: 'Failed to submit data. Please try again.' });
    } finally {
      this.isSubmitting.set(false);
      setTimeout(() => this.submitMessage.set(null), 5000);
    }
  }

  closeJsonModal(): void {
    this.showJsonData.set(false);
  }

  printChallan(): void {
    window.print();
  }
}
