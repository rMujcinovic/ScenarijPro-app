let EditorTeksta = function (divRef) {
    if (!divRef || divRef.tagName !== "DIV") {
        throw new Error("Pogresan tip elementa!");
    }
    if (divRef.getAttribute("contenteditable") !== "true") {
        throw new Error("Neispravan DIV, ne posjeduje contenteditable atribut!");
    }

    function hasTagInAncestors(node, tagNames) {
        let el = node.parentNode;
        tagNames = tagNames.map(t => t.toUpperCase());
        while (el && el !== divRef) {
            if (el.nodeType === 1 && tagNames.includes(el.tagName.toUpperCase())) {
                return true;
            }
            el = el.parentNode;
        }
        return false;
    }

    function isNodeBold(node) {
        return hasTagInAncestors(node, ["b", "strong"]);
    }

    function isNodeItalic(node) {
        return hasTagInAncestors(node, ["i", "em"]);
    }

    function isLetterOrDigitOrInnerSymbol(ch) {
        return /[0-9A-Za-zÀ-ž\-']/.test(ch);    // dozvoljeni karakteri
    }

    function hasLetter(str) {
        return /[A-Za-zÀ-ž]/.test(str);
    }

    function getBlockAncestor(node) {
        let el = node.parentNode;
        while (el && el !== divRef) {
            if (
                el.nodeType === 1 &&
                ["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6"].includes(el.tagName.toUpperCase())
            ) {
                return el;
            }
            el = el.parentNode;
        }
        return divRef;
    }

    // tree walker prolazi kroz DOM cvor po cvor po filteru (u ovom slucaju text)
    let dajBrojRijeci = function () {
        let walker = document.createTreeWalker(
            divRef,
            NodeFilter.SHOW_TEXT,
            null,
            false,
        );

        let chars = [];
        let node;
        let prevBlock = null;   // null da ne ubacuje razmak prije prvog bloka

        while ((node = walker.nextNode())) {
            let text = node.nodeValue || "";
            if (!text) continue;

            let bold = isNodeBold(node);
            let italic = isNodeItalic(node);
            let currentBlock = getBlockAncestor(node);

            // Kad prelazi u drugi blok, zatvori prethodnu rijec tj. doda jedan razmak da razdvoji 
            if (prevBlock && currentBlock !== prevBlock) {
                chars.push({ ch: " ", bold: false, italic: false });
            }
            prevBlock = currentBlock;

            for (let i = 0; i < text.length; i++) {
                chars.push({
                    ch: text[i],
                    bold: bold,
                    italic: italic,
                });
            }
        }
        let ukupno = 0;
        let boldiranih = 0;
        let italic = 0;

        let wordChars = [];
        let boldFlags = [];
        let italicFlags = [];

        function flushWord() {
            if (wordChars.length === 0) return; 

            let wordStr = wordChars.join("");
            if (hasLetter(wordStr)) {
                ukupno++;

                let allBold = boldFlags.length > 0 && boldFlags.every(v=>v===true);
                if (allBold) boldiranih++;

                let allItalic = italicFlags.length > 0 && italicFlags.every(v => v === true);
                if (allItalic) italic++;
            }

            wordChars = [];
            boldFlags = [];
            italicFlags = [];
        }

        for (let i = 0; i < chars.length; i++) {
            let { ch, bold, italic: it } = chars[i];

            if (isLetterOrDigitOrInnerSymbol(ch)) {
                wordChars.push(ch);
                boldFlags.push(bold);
                italicFlags.push(it);
            } else {
                flushWord();
            }
        }
        flushWord();

        return {
            ukupno: ukupno, 
            boldiranih: boldiranih, 
            italic: italic, 
        };
    };
}