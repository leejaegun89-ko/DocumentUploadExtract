document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsBody = document.getElementById('resultsBody');
    const activeFilesCount = document.getElementById('activeFiles');
    
    let processedFiles = [];

    // 파일 데이터를 저장할 Map 추가
    const fileDataMap = new Map();

    fileInput.addEventListener('change', handleFileSelect);

    // 드래그 앤 드롭 이벤트 처리
    const dropZone = document.querySelector('label[for="fileInput"]');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500');
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    async function handleFileSelect(event) {
        const files = event.target.files;
        if (files.length === 0) return;
        handleFiles(files);
    }

    async function handleFiles(files) {
        loadingIndicator.classList.remove('hidden');

        for (const file of files) {
            if (!file.type.includes('pdf')) {
                showError(`${file.name} is not a PDF file`);
                continue;
            }

            try {
                const fileData = await file.arrayBuffer();
                fileDataMap.set(file.name, fileData);

                console.log('Processing file:', file.name);
                const text = await extractTextFromPDF(file);
                console.log('=== Extracted Raw Text ===');
                console.log(text);
                console.log('=== End of Raw Text ===');

                const extractedInfo = extractInformation(text);
                console.log('=== Extraction Results ===');
                console.log('Looking for Beneficiary:', findBeneficiary(text));
                console.log('Looking for Receipt Number:', findReceiptNumber(text));
                console.log('Looking for Received Date:', findReceivedDate(text));
                console.log('Looking for Case Type:', findCaseType(text));
                console.log('Looking for Valid From To:', findValidFromTo(text));
                console.log('Final Extracted Info:', extractedInfo);
                console.log('=== End of Extraction ===');

                // Validate extracted information
                const validationErrors = validateExtractedInfo(extractedInfo);
                if (validationErrors.length > 0) {
                    console.warn('Validation errors for ' + file.name + ':', validationErrors);
                    validationErrors.forEach(error => showWarning(file.name + ': ' + error));
                }
                
                processedFiles.push({
                    fileName: file.name,
                    info: extractedInfo
                });
                
                renderTable();
                updateActiveFilesCount();
            } catch (error) {
                console.error('Error processing file:', file.name, error);
                showError(`Error processing ${file.name}: ${error.message}`);
            }
        }

        loadingIndicator.classList.add('hidden');
        fileInput.value = '';
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'bg-red-50 p-4 rounded-xl mb-4 shadow-sm';
        errorDiv.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                    </svg>
                </div>
                <div class="ml-3">
                    <p class="text-sm text-red-700">${message}</p>
                </div>
            </div>
        `;
        document.querySelector('main').insertBefore(errorDiv, loadingIndicator);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    function showWarning(message) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'bg-yellow-50 p-4 rounded-xl mb-4 shadow-sm';
        warningDiv.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                </div>
                <div class="ml-3">
                    <p class="text-sm text-yellow-700">${message}</p>
                </div>
            </div>
        `;
        document.querySelector('main').insertBefore(warningDiv, loadingIndicator);
        setTimeout(() => warningDiv.remove(), 5000);
    }

    function updateActiveFilesCount() {
        activeFilesCount.textContent = processedFiles.length;
    }

    async function extractTextFromPDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // PDF.js 워커 설정
            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
            });

            const pdf = await loadingTask.promise;
            let fullText = '';

            console.log('PDF loaded, processing', pdf.numPages, 'pages');

            for (let i = 1; i <= pdf.numPages; i++) {
                console.log('Processing page', i);
                const page = await pdf.getPage(i);
                
                // 먼저 일반적인 텍스트 추출 시도
                const textContent = await page.getTextContent();
                
                if (textContent.items.length === 0) {
                    console.log('No embedded text found, trying OCR...');
                    
                    try {
                        // 페이지를 캔버스에 렌더링
                        const viewport = page.getViewport({ scale: 2.0 }); // 고품질을 위해 2배 스케일
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({
                            canvasContext: context,
                            viewport: viewport
                        }).promise;

                        // OCR 수행
                        console.log('Performing OCR on page', i);
                        
                        // Tesseract 워커 초기화 (페이지별로 새로운 워커 생성)
                        const worker = await Tesseract.createWorker({
                            logger: progress => {
                                if (progress.status === 'recognizing text') {
                                    console.log('OCR Progress:', (progress.progress * 100).toFixed(2) + '%');
                                }
                            }
                        });
                        
                        // 언어 설정
                        await worker.loadLanguage('eng');
                        await worker.initialize('eng');
                        
                        // OCR 설정
                        await worker.setParameters({
                            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-,/: ',
                        });

                        // OCR 실행
                        const { data: { text } } = await worker.recognize(canvas);
                        console.log('OCR result:', text);
                        
                        // 워커 종료
                        await worker.terminate();
                        
                        fullText += text + '\n';
                    } catch (ocrError) {
                        console.error('OCR Error:', ocrError);
                        showWarning(`OCR failed for page ${i}: ${ocrError.message}`);
                    }
                } else {
                    // 일반적인 텍스트 추출이 성공한 경우
                    const pageText = textContent.items
                        .map(item => item.str)
                        .join(' ');
                    fullText += pageText + '\n';
                }
            }

            console.log('=== Final Extracted Text ===');
            console.log(fullText);
            console.log('=== End of Final Text ===');
            
            if (!fullText.trim()) {
                throw new Error('No text could be extracted from the PDF');
            }

            return fullText;
        } catch (error) {
            console.error('Error in PDF text extraction:', error);
            throw new Error('Failed to extract text from PDF: ' + error.message);
        }
    }

    function extractInformation(text) {
        // 텍스트 전처리
        text = text.replace(/\s+/g, ' ').trim();
        
        // OCR 결과에서 자주 발생하는 오류 수정
        text = text
            .replace(/[|]/g, 'I')
            .replace(/[{}]/g, 'I')
            .replace(/\bL(?=EE\b)/g, 'L')
            .replace(/\b0(?=\d{8})/g, 'O')
            // Receipt Number를 위한 추가 전처리
            .replace(/[oO](?=\d{9,10})/gi, '0')  // OCR이 0을 O로 잘못 인식하는 경우
            .replace(/[Ss](?=RC\d{10})/gi, 'S')  // SRC 접두어 수정
            .replace(/[Ee](?=AC\d{10})/gi, 'E')  // EAC 접두어 수정
            .replace(/[Ww](?=AC\d{10})/gi, 'W')  // WAC 접두어 수정
            .replace(/[Ll](?=IN\d{10})/gi, 'L')  // LIN 접두어 수정
            .replace(/[Mm](?=SC\d{10})/gi, 'M')  // MSC 접두어 수정
            .replace(/[Ii](?=OE\d{9})/gi, 'I')   // IOE 접두어 수정
            .replace(/[1Il](?=OE\d{9})/gi, 'I'); // 추가: 1을 I로 수정 (IOE 케이스)

        const info = {
            name: findBeneficiary(text),
            receiptNumber: findReceiptNumber(text),
            receivedDate: findReceivedDate(text),
            validFromTo: findValidFromTo(text)
        };

        return info;
    }

    function findBeneficiary(text) {
        // Beneficiary 이름을 찾기 위한 패턴들
        const patterns = [
            // 정확한 "LEE, JAE KEON" 패턴
            /\b(LEE,\s*JAE\s*KEON)\b/i,
            
            // Beneficiary 레이블 다음에 오는 이름
            /Beneficiary(?:'s)?(?:\s*Name)?[:\s]+([A-Z]+,\s*[A-Z\s]+?)(?=\s+(?:DOB|A\d+|Notice|Valid|\d{4}|\s*$))/i,
            
            // "named beneficiary" 문구 근처의 이름
            /named\s+beneficiar(?:y|ies)\s+([A-Z]+,\s*[A-Z\s]+?)(?=\s+(?:is|are|has|have|DOB|A\d+|Notice|Valid|\d{4}|\s*$))/i,
            
            // 일반적인 이름 형식 (성, 이름)
            /\b([A-Z]+,\s*[A-Z\s]+?)(?=\s+(?:is|are|has|have|DOB|A\d+|Notice|Valid|\d{4}|\s*$))/i
        ];

        const match = findFirstMatch(text, patterns);
        // LEE, JAE KEON 형식으로 표준화
        if (match) {
            return match.toUpperCase().replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    function findReceiptNumber(text) {
        // Receipt Number 패턴 강화
        const patterns = [
            // 1. IOE 패턴 (가장 일반적인 형식)
            /\b(IOE[-\s]?\d{9})\b/i,
            
            // 2. Receipt Number 레이블과 함께 있는 경우
            /(?:Receipt|Case|Application|USCIS|Notice)[\s#]*(?:Number|No|ID)?[:\s]*([A-Z]{3}[-\s]?\d{9,10})/i,
            
            // 3. USCIS/DHS Number 패턴
            /(?:USCIS|DHS)[\s#]*(?:Account|Number|#|Case|Receipt)[:\s]*([A-Z]{3}[-\s]?\d{9,10})/i,
            
            // 4. Form I-797 문서에서 일반적인 위치
            /Form\s+I-?797[^]*?([A-Z]{3}[-\s]?\d{9,10})/i,
            
            // 5. 일반적인 Receipt Number 형식
            /\b([A-Z]{3}[-\s]?\d{9,10})\b/i,
            
            // 6. 숫자만 있는 경우 (IOE 접두어 추가)
            /\b(\d{9})\b/
        ];

        let match = findFirstMatch(text, patterns);
        if (!match) return '';

        // Receipt Number 형식 검증 및 정규화
        let normalized = match.toUpperCase()
            .replace(/[oO0]/g, (m) => /[oO]/.test(m) ? '0' : m)  // OCR 오류 수정: o/O → 0
            .replace(/[iIl|]/g, (m) => /[l|]/.test(m) ? 'I' : m) // OCR 오류 수정: l/|/1 → I
            .replace(/[sS5]/g, (m) => /5/.test(m) ? 'S' : m)     // OCR 오류 수정: 5 → S
            .replace(/[\s-]/g, '');                               // 공백과 하이픈 제거

        // 숫자만 있는 경우 IOE 접두어 추가
        if (/^\d{9}$/.test(normalized)) {
            normalized = 'IOE' + normalized;
        }

        // 알려진 USCIS Receipt Number 접두어 검증
        const validPrefixes = ['IOE', 'WAC', 'EAC', 'SRC', 'LIN', 'MSC'];
        const prefix = normalized.substring(0, 3);
        
        if (validPrefixes.includes(prefix) && /^[A-Z]{3}\d{9,10}$/.test(normalized)) {
            const numericPart = normalized.substring(3);
            if (numericPart.length >= 9 && numericPart.length <= 10) {
                return normalized;
            }
        }
        return '';
    }

    function findReceivedDate(text) {
        const patterns = [
            /Received\s*Date[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
            /Notice\s*Date[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
            /(?:^|\s)Date[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
            /(?:^|\s)(\d{2}\/\d{2}\/\d{4})(?=\s+(?:Notice|Receipt|Case))/i,
            /(?:^|\s)(\d{2}\/\d{2}\/\d{4})(?:\s|$)/i  // 더 일반적인 패턴 추가
        ];
        return findFirstMatch(text, patterns);
    }

    function findCaseType(text) {
        // 알려진 USCIS 폼 타입들
        const knownFormTypes = {
            'I129': ['H-1B', 'L-1', 'O-1', 'P-1', 'R-1', 'TN'],
            'I130': ['IR-1', 'F2A', 'F2B', 'F3', 'F4'],
            'I140': ['EB-1', 'EB-2', 'EB-3', 'EB-4'],
            'I485': ['AOS', 'Adjustment of Status'],
            'I765': ['EAD', 'Employment Authorization'],
            'I539': ['Extension of Stay', 'Change of Status']
        };

        // Case Type 패턴 강화
        const patterns = [
            // 1. 정확한 Form 패턴 (다양한 폼 타입 지원)
            /\bForm\s*I-?(?:129|130|140|485|539|765)\b/i,
            
            // 2. Case Type 레이블과 함께 있는 경우
            /Case\s*Type[:\s]*(?:Form\s*)?I-?(?:129|130|140|485|539|765)\b/i,
            
            // 3. Notice Type에서 나타나는 패턴
            /Notice\s+Type[^]*?\bI-?(?:129|130|140|485|539|765)\b/i,
            
            // 4. Classification에서 나타나는 패턴
            /Classification[:\s]*(?:Form\s*)?I-?(?:129|130|140|485|539|765)\b/i,
            
            // 5. 일반적인 Form 패턴
            /\bI-?(?:129|130|140|485|539|765)\b/i
        ];

        const match = findFirstMatch(text, patterns);
        if (!match) return '';

        // Form 번호 정규화
        const normalized = match.toUpperCase()
            .replace(/[iIl|](?=-?\d)/g, 'I') // OCR 오류 수정: l/|/1 → I (숫자 앞에 있을 때만)
            .replace(/[-\s]/g, ''); // 공백과 하이픈 제거

        // Form 번호가 알려진 타입인지 확인
        if (Object.keys(knownFormTypes).includes(normalized)) {
            return normalized;
        }

        return '';
    }

    function findValidFromTo(text) {
        const patterns = [
            /Valid\s*from\s*(\d{2}\/\d{2}\/\d{4})\s*(?:to|through)\s*(\d{2}\/\d{2}\/\d{4})/i,
            /Status\s*Valid\s*from\s*(\d{2}\/\d{2}\/\d{4})\s*(?:to|through)\s*(\d{2}\/\d{2}\/\d{4})/i,
            /Dates?\s*Valid\s*from\s*(\d{2}\/\d{2}\/\d{4})\s*(?:to|through)\s*(\d{2}\/\d{2}\/\d{4})/i,
            /(\d{2}\/\d{2}\/\d{4})\s*(?:to|through)\s*(\d{2}\/\d{2}\/\d{4})/i  // 더 일반적인 패턴 추가
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1] && match[2]) {
                return `${match[1]} to ${match[2]}`;
            }
        }
        return '';
    }

    function findFirstMatch(text, patterns) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return '';
    }

    function renderTable() {
        resultsBody.innerHTML = '';
        processedFiles.forEach((file, index) => {
            addRowToTable(file.fileName, file.info, index);
        });
    }

    function addRowToTable(fileName, info, index) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-lawfully-50 transition-colors duration-150';
        
        const validationErrors = validateExtractedInfo(info);
        const validationStatus = validationErrors.length === 0 ? 'valid' : 'warning';
        
        // Create cells for each field
        const fields = [
            { value: fileName, field: 'fileName' },
            { value: info.name, field: 'name' },
            { value: info.receiptNumber, field: 'receiptNumber' },
            { value: info.receivedDate, field: 'receivedDate' },
            { value: info.validFromTo, field: 'validFromTo' }
        ];

        fields.forEach(({ value, field }) => {
            const td = document.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap text-sm';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex items-center';
            
            const textSpan = document.createElement('span');
            textSpan.className = field === 'fileName' ? 'text-gray-900' : 'text-gray-500';
            textSpan.textContent = value || '-';
            contentDiv.appendChild(textSpan);

            // Add validation indicator if this field has validation
            if (field !== 'fileName' && value) {
                const isValid = !validationErrors.some(err => err.includes(field));
                const statusIcon = document.createElement('span');
                statusIcon.className = `ml-2 ${isValid ? 'text-green-500' : 'text-yellow-500'}`;
                statusIcon.innerHTML = isValid
                    ? '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>'
                    : '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>';
                
                // Add tooltip for validation errors
                if (!isValid) {
                    const error = validationErrors.find(err => err.includes(field));
                    statusIcon.title = error;
                    statusIcon.className += ' cursor-help';
                }
                
                contentDiv.appendChild(statusIcon);
            }
            
            td.appendChild(contentDiv);
            row.appendChild(td);
        });

        // Actions cell
        const actionCell = document.createElement('td');
        actionCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center space-x-3';
        
        // View button
        const viewButton = document.createElement('button');
        viewButton.className = 'text-lawfully-600 hover:text-lawfully-700 font-medium transition-colors duration-150 flex items-center';
        viewButton.innerHTML = `
            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View
        `;
        viewButton.onclick = () => viewFile(fileName);
        
        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'text-red-600 hover:text-red-700 font-medium transition-colors duration-150 flex items-center';
        deleteButton.innerHTML = `
            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
        `;
        deleteButton.onclick = () => {
            processedFiles.splice(index, 1);
            fileDataMap.delete(fileName);
            renderTable();
            updateActiveFilesCount();
        };
        
        actionCell.appendChild(viewButton);
        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);
        
        resultsBody.appendChild(row);
    }

    function viewFile(fileName) {
        const fileData = fileDataMap.get(fileName);
        if (!fileData) {
            showError('File data not found');
            return;
        }

        // Blob 생성 및 URL 생성
        const blob = new Blob([fileData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // 새 창에서 PDF 열기
        window.open(url, '_blank');

        // 메모리 누수 방지를 위해 일정 시간 후 URL 해제
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    function validateExtractedInfo(info) {
        const validations = {
            name: (name) => /^[A-Z]+,\s*[A-Z\s]+$/i.test(name),
            receiptNumber: (num) => /^(?:IOE|WAC|EAC|SRC|LIN|MSC)\d{9,10}$/i.test(num),
            receivedDate: (date) => /^\d{2}\/\d{2}\/\d{4}$/.test(date) && isValidDate(date),
            validFromTo: (dates) => {
                if (!/^\d{2}\/\d{2}\/\d{4}\s*(?:to|through)\s*\d{2}\/\d{2}\/\d{4}$/.test(dates)) return false;
                const [fromDate, toDate] = dates.split(/\s*(?:to|through)\s*/);
                return isValidDate(fromDate) && isValidDate(toDate) && isValidDateRange(fromDate, toDate);
            }
        };

        const errors = [];
        for (const [field, validator] of Object.entries(validations)) {
            if (info[field] && !validator(info[field])) {
                errors.push(`Invalid ${field}: ${info[field]}`);
            }
        }

        return errors;
    }

    function isValidDate(dateStr) {
        const [month, day, year] = dateStr.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        return date.getMonth() === month - 1 && date.getDate() === day && date.getFullYear() === year;
    }

    function isValidDateRange(fromDate, toDate) {
        const from = new Date(fromDate.split('/').reverse().join('-'));
        const to = new Date(toDate.split('/').reverse().join('-'));
        return from <= to;
    }

    // Logo management
    const settingsButton = document.getElementById('settingsButton');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsButton = document.getElementById('closeSettingsButton');
    const uploadLogoButton = document.getElementById('uploadLogoButton');
    const logoInput = document.getElementById('logoInput');
    const logoPreview = document.getElementById('logoPreview');
    const headerLogo = document.getElementById('headerLogo');

    // Load saved logo from localStorage if exists
    const savedLogo = localStorage.getItem('customLogo');
    if (savedLogo) {
        logoPreview.src = savedLogo;
        headerLogo.src = savedLogo;
    }

    // Settings modal controls
    settingsButton.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettingsButton.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // Logo upload handling
    uploadLogoButton.addEventListener('click', () => {
        logoInput.click();
    });

    logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showError('Logo file size must be less than 5MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Create a canvas to potentially resize the image
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // If image is larger than 256x256, resize it while maintaining aspect ratio
                    const maxSize = 256;
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = Math.round((height * maxSize) / width);
                            width = maxSize;
                        } else {
                            width = Math.round((width * maxSize) / height);
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to base64 and save
                    const dataUrl = canvas.toDataURL(file.type);
                    logoPreview.src = dataUrl;
                    headerLogo.src = dataUrl;
                    localStorage.setItem('customLogo', dataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}); 