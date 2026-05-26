function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderMarkdown(markdownText) {
    if (!markdownText) return `<p class="text-neutral-500 italic">${i18n[currentLang].noContent}</p>`;
    
    const lines = markdownText.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeBlockContent = '';
    let codeBlockStartLine = 0;

    let charIndex = 0;
    const currentBlame = blameMap[activeNoteKey] || [];

    function getHTMLWithBlame(text, startOffset) {
        if (!blameModeEnabled || currentBlame.length === 0) {
            return parseInlineElements(text);
        }

        let textLen = text.length;
        let processed = 0;
        let resultHTML = '';

        let accumulated = 0;
        let blameIdx = 0;

        while (blameIdx < currentBlame.length && accumulated + currentBlame[blameIdx].length <= startOffset) {
            accumulated += currentBlame[blameIdx].length;
            blameIdx++;
        }

        while (processed < textLen && blameIdx < currentBlame.length) {
            const seg = currentBlame[blameIdx];
            const segStartInText = Math.max(0, accumulated - startOffset);
            const segEndInText = Math.min(textLen, accumulated + seg.length - startOffset);
            const lenInSegment = segEndInText - segStartInText;

            if (lenInSegment > 0) {
                const subText = text.substring(processed, processed + lenInSegment);
                const safeSub = parseInlineElements(subText);
                
                const hexColor = seg.color;
                let r = 100, g = 100, b = 100;
                if (hexColor.startsWith('#')) {
                    const num = parseInt(hexColor.slice(1), 16);
                    r = (num >> 16) & 255;
                    g = (num >> 8) & 255;
                    b = num & 255;
                }

                resultHTML += `<span class="blame-highlight" style="background-color: rgba(${r}, ${g}, ${b}, 0.22);" title="Modificado por: ${seg.name}">${safeSub}</span>`;
                processed += lenInSegment;
            }

            accumulated += seg.length;
            blameIdx++;
        }

        if (processed < textLen) {
            resultHTML += parseInlineElements(text.substring(processed));
        }

        return resultHTML;
    }

    lines.forEach((line, index) => {
        const lineLengthIncludingNewline = line.length + 1;

        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                html += `<pre class="bg-neutral-900 border border-neutral-800 p-3 rounded-lg my-2 font-mono text-xs overflow-x-auto text-purple-300"><code>${escapeHTML(codeBlockContent)}</code></pre>`;
                codeBlockContent = '';
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
                codeBlockStartLine = index;
            }
            charIndex += lineLengthIncludingNewline;
            return;
        }

        if (inCodeBlock) {
            codeBlockContent += line + '\n';
            charIndex += lineLengthIncludingNewline;
            return;
        }

        if (line.trim() === '---') {
            html += `<hr class="border-obsidian-border my-5" />`;
            charIndex += lineLengthIncludingNewline;
            return;
        }

        if (line.startsWith('# ')) {
            html += `<h1 id="heading-${index}" class="text-white hover:text-obsidian-accent cursor-pointer transition-colors font-sans" onclick="scrollEditorToLine(${index})">${getHTMLWithBlame(line.slice(2), charIndex + 2)}</h1>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }
        if (line.startsWith('## ')) {
            html += `<h2 id="heading-${index}" class="text-white hover:text-obsidian-accent cursor-pointer transition-colors font-sans" onclick="scrollEditorToLine(${index})">${getHTMLWithBlame(line.slice(3), charIndex + 3)}</h2>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }
        if (line.startsWith('### ')) {
            html += `<h3 id="heading-${index}" class="text-white hover:text-obsidian-accent cursor-pointer transition-colors font-sans" onclick="scrollEditorToLine(${index})">${getHTMLWithBlame(line.slice(4), charIndex + 4)}</h3>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }
        if (line.startsWith('#### ')) {
            html += `<h4 id="heading-${index}" class="text-white hover:text-obsidian-accent cursor-pointer transition-colors font-sans" onclick="scrollEditorToLine(${index})">${getHTMLWithBlame(line.slice(5), charIndex + 5)}</h4>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }

        const checkboxRegex = /^(\s*)-\s*\[([ xX])\]\s*(.*)$/;
        const checkboxMatch = line.match(checkboxRegex);
        if (checkboxMatch) {
            const spaces = checkboxMatch[1].length;
            const isChecked = checkboxMatch[2].toLowerCase() === 'x';
            const offsetStart = charIndex + spaces + 5;
            const mainTextWithBlame = getHTMLWithBlame(checkboxMatch[3], offsetStart);
            const paddingLeft = spaces * 8; 

            html += `
            <div class="task-item flex items-start gap-2.5 py-1 px-1.5 rounded-md hover:bg-neutral-800/30 transition-all font-sans" style="margin-left: ${paddingLeft}px">
                <input type="checkbox" ${isChecked ? 'checked' : ''} data-line-index="${index}" class="obsidian-checkbox mt-1 flex-shrink-0">
                <span class="text-gray-300 ${isChecked ? 'line-through text-neutral-500' : ''} text-sm leading-relaxed">${mainTextWithBlame}</span>
            </div>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }

        const bulletRegex = /^(\s*)-\s*(.*)$/;
        const bulletMatch = line.match(bulletRegex);
        if (bulletMatch) {
            const spaces = bulletMatch[1].length;
            const offsetStart = charIndex + spaces + 2;
            const mainTextWithBlame = getHTMLWithBlame(bulletMatch[2], offsetStart);
            const paddingLeft = spaces * 8;

            html += `
            <div class="bullet-item flex items-start gap-2.5 py-0.5 font-sans" style="margin-left: ${paddingLeft}px">
                <span class="text-obsidian-accent select-none mt-2 w-1.5 h-1.5 rounded-full bg-obsidian-accent flex-shrink-0"></span>
                <span class="text-gray-300 text-sm leading-relaxed">${mainTextWithBlame}</span>
            </div>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }

        if (line.trim() === '') {
            html += `<div class="h-2"></div>`;
            charIndex += lineLengthIncludingNewline;
            return;
        }

        html += `<p class="text-sm my-1 font-sans">${getHTMLWithBlame(line, charIndex)}</p>`;
        charIndex += lineLengthIncludingNewline;
    });

    return html;
}

function parseInlineElements(text) {
    let parsed = escapeHTML(text);
    
    const spoilerTitle = currentLang === 'pt-br' ? 'Spoiler: Clique para revelar' : 'Spoiler: Click to reveal';
    parsed = parsed.replace(/\|\|(.*?)\|\|/g, `<span class="markdown-spoiler" onclick="this.classList.toggle('revealed')" title="${spoilerTitle}">$1</span>`);

    // Obsidian Wikilinks [[Note#Heading|Alias]]
    parsed = parsed.replace(/\[\[((?:[^\]#|]*))(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (match, noteName, heading, alias) => {
        const display = alias || (noteName + (heading ? '#' + heading : ''));
        const targetNoteKey = noteName.trim() ? findNoteKeyByTitle(noteName.trim()) : activeNoteKey;
        
        if (targetNoteKey) {
            return `<a href="javascript:void(0)" onclick="handleWikilinkClick('${targetNoteKey}', '${escapeHTML(heading || '')}')" class="text-obsidian-accent hover:underline font-semibold wikilink">${escapeHTML(display)}</a>`;
        } else {
            return `<span class="wikilink-broken text-red-400/80 italic" title="${currentLang === 'pt-br' ? 'Nota não encontrada' : 'Note not found'}">${escapeHTML(display)}</span>`;
        }
    });

    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
    parsed = parsed.replace(/__(.*?)__/g, '<strong class="font-bold text-white">$1</strong>');
    parsed = parsed.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    parsed = parsed.replace(/_(.*?)_/g, '<em class="italic">$1</em>');
    parsed = parsed.replace(/==(.*?)==/g, '<mark class="bg-purple-900/40 text-purple-300 border border-purple-800/40 px-1 py-0.5 rounded text-xs font-semibold">$1</mark>');
    parsed = parsed.replace(/`(.*?)`/g, '<code class="bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded font-mono text-xs text-purple-300">$1</code>');
    parsed = parsed.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-purple-400 hover:text-purple-300 font-semibold underline inline-flex items-center gap-1">$1 <i class="fa-solid fa-external-link text-[10px] opacity-70"></i></a>');
    
    // Render native @Name Mentions cleanly 
    parsed = parsed.replace(/@([A-Za-z0-9_À-ÿ]+(?: [A-Za-z0-9_À-ÿ]+)?)/g, (match, name) => {
        let color = 'var(--accent-color)';
        const peers = [localUser, ...Object.values(remotePeersData)];
        const found = peers.find(p => p.name === name);
        if (found) color = found.color;
        
        return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-obsidian-active text-white border-l-2 shadow-sm" style="border-color: ${color}">${escapeHTML(match)}</span>`;
    });

    return parsed;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

function loadActiveNote() {
    const note = vault[activeNoteKey];
    if (!note) return;

    document.getElementById('breadcrumb-filename').innerText = note.title + ".md";
    document.getElementById('active-tab-title').innerText = note.title;
    document.getElementById('note-title-input').value = note.title;

    const textarea = document.getElementById('markdown-textarea');
    textarea.value = note.content;

    renderActiveNote();
}
window.loadActiveNote = loadActiveNote;

function renderActiveNote() {
    const note = vault[activeNoteKey];
    if (!note) return;

    const preview = document.getElementById('rendered-preview');
    preview.innerHTML = renderMarkdown(note.content);

    if (window.updateLineNumbers) window.updateLineNumbers();
    if (window.updateEditorOverlays) window.updateEditorOverlays();
    
    if (window.updateWordCount) window.updateWordCount(note.content);
    if (window.renderOutline) window.renderOutline(note.content);
    if (window.updateChecklistProgress) window.updateChecklistProgress(note.content);
    
    if (window.renderRemoteCursors) window.renderRemoteCursors();
}
window.renderActiveNote = renderActiveNote;

// Markdown Engine Extension: Textarea Overlay logic for Mentions and Spoilers
window.updateEditorOverlays = function() {
    const textarea = document.getElementById('markdown-textarea');
    const overlays = document.getElementById('editor-overlays');
    if (!textarea || !overlays) return;

    const text = textarea.value;
    const lines = text.split('\n');
    const caretPos = textarea.selectionStart;
    const activeLineIndex = text.substring(0, caretPos).split('\n').length - 1;

    let finalHTML = '';
    
    lines.forEach((line, index) => {
        const isActive = index === activeLineIndex && document.activeElement === textarea;
        let lineHTML = '';

        if (viewMode === 'hybrid' && !isActive) {
            // In Hybrid mode, parse inactive lines but keep them single-line for alignment
            lineHTML = parseHybridLine(line);
        } else {
            // Raw mode or active line: show visible text in overlay since textarea is transparent
            let rawLine = escapeHTML(line);
            
            // Highlight Mentions (visible color)
            rawLine = rawLine.replace(/@([A-Za-z0-9_À-ÿ]+(?: [A-Za-z0-9_À-ÿ]+)?)/g, (match) => {
                let color = 'var(--accent-color)';
                const peers = [localUser, ...Object.values(remotePeersData)];
                const found = peers.find(p => p.name === match.slice(1));
                if (found) color = found.color;
                return `<span class="bg-obsidian-active text-white border-l-2 px-1 rounded" style="border-color: ${color}">${match}</span>`;
            });

            // Mask/Hide Spoilers on inactive lines
            rawLine = rawLine.replace(/\|\|(.*?)\|\|/g, (match) => {
                if (isActive) {
                    // On active line, show markers and content
                    return `<span class="border border-obsidian-accent/50 rounded px-0.5 text-gray-200 bg-obsidian-active/30">${match}</span>`;
                } else {
                    // On inactive lines, mask content
                    const title = currentLang === 'pt-br' ? 'Spoiler: Ative a linha para editar' : 'Spoiler: Activate line to edit';
                    return `<span class="bg-neutral-900 text-neutral-900 rounded border border-neutral-700 select-none" title="${title}">${match}</span>`;
                }
            });

            lineHTML = `<span class="text-gray-200">${rawLine}</span>`;
        }

        finalHTML += `<div>${lineHTML || '&#8203;'}</div>`;
    });

    overlays.innerHTML = finalHTML;
    overlays.scrollTop = textarea.scrollTop;
};

function parseHybridLine(line) {
    if (!line.trim()) return '&#8203;';
    
    // Priority 1: Headers (styled to match line height)
    if (line.startsWith('# ')) {
        return `<span class="text-white font-bold border-b border-obsidian-border pb-0.5">${escapeHTML(line.slice(2))}</span>`;
    } else if (line.startsWith('## ')) {
        return `<span class="text-white font-bold">${escapeHTML(line.slice(3))}</span>`;
    } else if (line.startsWith('### ')) {
        return `<span class="text-gray-300 font-bold">${escapeHTML(line.slice(4))}</span>`;
    }

    // Priority 2: Checkboxes
    const checkboxRegex = /^(\s*)-\s*\[([ xX])\]\s*(.*)$/;
    const checkboxMatch = line.match(checkboxRegex);
    if (checkboxMatch) {
        const isChecked = checkboxMatch[2].toLowerCase() === 'x';
        const content = parseHybridInline(checkboxMatch[3]);
        return `<span class="inline-flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded border border-neutral-500 flex items-center justify-center ${isChecked ? 'bg-obsidian-accent border-obsidian-accent' : ''}">${isChecked ? '<i class="fa-solid fa-check text-[8px] text-white"></i>' : ''}</span> <span class="${isChecked ? 'line-through text-neutral-500' : 'text-gray-300'}">${content}</span></span>`;
    }

    // Priority 3: Bullets
    const bulletRegex = /^(\s*)-\s*(.*)$/;
    const bulletMatch = line.match(bulletRegex);
    if (bulletMatch) {
        const content = parseHybridInline(bulletMatch[2]);
        return `<span class="inline-flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-obsidian-accent"></span> <span class="text-gray-300">${content}</span></span>`;
    }

    return parseHybridInline(line);
}

function parseHybridInline(text) {
    let parsed = escapeHTML(text);
    
    // Spoilers (always masked on inactive lines in hybrid)
    parsed = parsed.replace(/\|\|(.*?)\|\|/g, `<span class="bg-neutral-900 text-neutral-900 rounded border border-neutral-700 select-none">||$1||</span>`);
    
    // Obsidian Wikilinks [[Note#Heading|Alias]]
    parsed = parsed.replace(/\[\[((?:[^\]#|]*))(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (match, noteName, heading, alias) => {
        const display = alias || (noteName + (heading ? '#' + heading : ''));
        const targetNoteKey = noteName.trim() ? findNoteKeyByTitle(noteName.trim()) : activeNoteKey;
        
        if (targetNoteKey) {
            return `<span class="text-obsidian-accent font-semibold border-b border-obsidian-accent/30">${escapeHTML(display)}</span>`;
        } else {
            return `<span class="wikilink-broken text-red-400/80 italic">${escapeHTML(display)}</span>`;
        }
    });

    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
    parsed = parsed.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    parsed = parsed.replace(/==(.*?)==/g, '<mark class="bg-purple-900/40 text-purple-300 px-1 rounded">$1</mark>');
    parsed = parsed.replace(/`(.*?)`/g, '<code class="bg-neutral-800 border border-neutral-700 px-1 rounded text-purple-300">$1</code>');
    
    // Mentions
    parsed = parsed.replace(/@([A-Za-z0-9_À-ÿ]+(?: [A-Za-z0-9_À-ÿ]+)?)/g, (match, name) => {
        let color = 'var(--accent-color)';
        const peers = [localUser, ...Object.values(remotePeersData)];
        const found = peers.find(p => p.name === name);
        if (found) color = found.color;
        return `<span class="px-1 rounded bg-obsidian-active text-white border-l-2" style="border-color: ${color}">${match}</span>`;
    });

    return parsed;
}

let updateLineNumbersTimeout = null;
window.updateLineNumbers = function() {
    const textarea = document.getElementById('markdown-textarea');
    const container = document.getElementById('line-numbers');
    if (!textarea || !container) return;

    if (updateLineNumbersTimeout) clearTimeout(updateLineNumbersTimeout);
    
    updateLineNumbersTimeout = setTimeout(() => {
        const lines = textarea.value.split('\n');
        
        let mirror = document.getElementById('line-mirror');
        if (!mirror) {
            mirror = document.createElement('div');
            mirror.id = 'line-mirror';
            textarea.parentElement.appendChild(mirror);
            mirror.style.position = 'absolute';
            mirror.style.visibility = 'hidden';
            mirror.style.pointerEvents = 'none';
            mirror.style.top = '0';
            mirror.style.left = '0';
            mirror.style.zIndex = '-999';
        }
        
        const computed = window.getComputedStyle(textarea);
        mirror.style.fontFamily = computed.fontFamily;
        mirror.style.fontSize = computed.fontSize;
        mirror.style.lineHeight = computed.lineHeight;
        mirror.style.padding = computed.padding;
        mirror.style.border = 'none'; 
        mirror.style.width = textarea.clientWidth + 'px'; 
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.boxSizing = 'border-box';

        let mirrorHTML = '';
        lines.forEach(line => {
            mirrorHTML += `<div>${escapeHTML(line) || '&#8203;'}</div>`;
        });
        mirror.innerHTML = mirrorHTML;
        
        const childNodes = mirror.childNodes;
        let numbersHTML = '';
        
        for (let i = 0; i < childNodes.length; i++) {
            const height = childNodes[i].getBoundingClientRect().height;
            numbersHTML += `<div style="height: ${height}px; display: flex; align-items: flex-start; justify-content: flex-end;">${i + 1}</div>`;
        }
        
        container.innerHTML = numbersHTML;
    }, 15);
};

window.handleEditorScroll = function() {
    syncScroll('editor');
    if (window.renderRemoteCursors) window.renderRemoteCursors();
    const textarea = document.getElementById('markdown-textarea');
    const overlays = document.getElementById('editor-overlays');
    if (textarea && overlays) overlays.scrollTop = textarea.scrollTop;
};

function syncScroll(source) {
    if (isScrolling) return;
    isScrolling = true;

    const textarea = document.getElementById('markdown-textarea');
    const preview = document.getElementById('preview-container');
    const lineNumbers = document.getElementById('line-numbers');

    if (source === 'editor') {
        const pct = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
        if (preview.scrollHeight > preview.clientHeight) {
            preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight);
        }
        lineNumbers.scrollTop = textarea.scrollTop;
    } else {
        const pct = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
        textarea.scrollTop = pct * (textarea.scrollHeight - textarea.clientHeight);
        lineNumbers.scrollTop = textarea.scrollTop;
    }

    setTimeout(() => { isScrolling = false; }, 50);
}
window.syncScroll = syncScroll;

function scrollEditorToLine(lineIndex) {
    const textarea = document.getElementById('markdown-textarea');
    const targetPct = lineIndex / textarea.value.split('\n').length;
    textarea.scrollTop = targetPct * (textarea.scrollHeight - textarea.clientHeight);

    const targetHeader = document.getElementById(`heading-${lineIndex}`);
    if (targetHeader) targetHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.scrollEditorToLine = scrollEditorToLine;
