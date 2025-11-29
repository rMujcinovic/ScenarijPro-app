let EditorTeksta = function (divRef) {
    if (!divRef || divRef.tagName !== "DIV") {
        throw new Error("Pogresan tip elementa!");
    }
    if (divRef.getAttribute("contenteditable") !== "true") {
        throw new Error("Neispravan DIV, ne posjeduje contenteditable atribut!");
    }

    function hasTagInAncestors(node, tagNames) {
        let el = node.parentNode;
        tagNames = tagNames.map(t => t.toUpperCase());      // map prolazi kroz svaki element niza tagNames i za svaki element poziva funkciju toupper
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

    function isSceneTitle(line) {
        let t = line.trim();
        if (!t) return false;
        if (t !== t.toUpperCase()) return false;
        let regex = /^(INT\.|EXT\.)\s+.+-\s+(DAY|NIGHT|AFTERNOON|MORNING|EVENING)\s*$/;
        return regex.test(t);
    }

    function isParenLine(line) {
        let t = line.trim();
        return /^\(.*\)$/.test(t);
    }

    function isAllCapsName(line) {
        let t = line.trim();
        if (!t) return false;

        // mora biti veliko
        if (t !== t.toUpperCase()) return false;

        // mora sadržavati barem jedno slovo
        if (!/[A-ZČĆŠĐŽ]/.test(t)) return false;

        // format: RIJEC ili RIJEC RIJEC ... (ne smije biti broj, tačka, razmak unutar riječi, itd.)
        if (!/^[A-ZČĆŠĐŽ]+(?: [A-ZČĆŠĐŽ]+)*$/.test(t)) return false;

        return true;
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

                let allBold = boldFlags.length > 0 && boldFlags.every(v => v === true);     // => testira da li je svaki element niza true
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

    // helper funkcija koja jednom parsira cijeli tekst, umjesto da se to izvodi iznova kad god treba
    function parseScript() {
        let text = divRef.innerText || "";
        let rawLines = text.split(/\r?\n/);

        let scenes = [];
        let currentScene = {
            title: null,
            lines: [],
            startIndex: 0
        };

        for (let i = 0; i < rawLines.length; i++) {
            let line = rawLines[i];
            if (isSceneTitle(line)) {
                if (currentScene.title !== null || currentScene.lines.length > 0) {
                    scenes.push(currentScene);
                }
                currentScene = {
                    title: line.trim(),
                    lines: [],
                    startIndex: i
                };
            } else {
                currentScene.lines.push({
                    globalIndex: i,
                    text: line
                });
            }
        }

        if (currentScene.title !== null || currentScene.lines.length > 0) {
            scenes.push(currentScene);
        }

        if (scenes.length > 0 && !scenes[0].title) {
            scenes[0].title = "SCENE 1";
        }

        let roleMap = {};

        scenes.forEach((scene, sceneIdx) => {
            let L = scene.lines;
            let n = L.length;
            let types = new Array(n).fill("unknown");

            for (let i = 0; i < n; i++) {
                let t = L[i].text.trim();
                if (t === "") {
                    types[i] = "empty";
                } else if (isParenLine(t)) {
                    types[i] = "paren";
                }
            }

            function isRoleStart(i) {
                if (types[i] === "empty" || types[i] === "paren") return false;
                let line = L[i].text.trim();
                if (!isAllCapsName(line)) return false;

                for (let j = i + 1; j < n; j++) {
                    let t2 = L[j].text.trim();
                    if (t2 === "") continue;
                    if (isParenLine(t2)) continue;
                    if (isSceneTitle(t2)) return false;
                    if (isAllCapsName(t2)) return false;
                    return true;
                }
                return false;
            }

            let blocksScene = [];
            let replikaCounterInScene = 0;

            for (let i = 0; i < n; i++) {
                if (isRoleStart(i)) {
                    types[i] = "roleHeader";
                    let roleName = L[i].text.trim();

                    let speechLines = [];
                    let speechIdxs = [];

                    let k = i + 1;
                    for (; k < n; k++) {
                        let tline = L[k].text;
                        let tr = tline.trim();

                        if (tr === "") {
                            break;
                        }
                        if (isSceneTitle(tr)) {
                            break;
                        }
                        if (isAllCapsName(tr) && isRoleStart(k)) {
                            break;
                        }
                        if (isParenLine(tr)) {
                            types[k] = "paren";
                            continue;
                        }

                        // linije koje pocinju sa velikim rijecima i dvotackom (ACTION:, NOTE: itd) tretiramo kao akcijski segment, koji prekida blok govora
                        if (/^[A-ZČĆŠĐŽ]+:/.test(tr)) {
                            types[k] = "action";
                            break;
                        }

                        types[k] = "speech";
                        speechLines.push(tline);
                        speechIdxs.push(k);
                    }


                    if (speechLines.length === 0) {
                        types[i] = "action";
                        continue;
                    }

                    replikaCounterInScene++;
                    if (!roleMap[roleName]) {
                        roleMap[roleName] = {
                            name: roleName,
                            count: 0,
                            blocks: []
                        };
                    }
                    roleMap[roleName].count++;

                    let block = {
                        role: roleName,
                        sceneTitle: scene.title,
                        sceneIndex: sceneIdx,
                        headerLine: i,
                        startLine: i,
                        endLine: k - 1,
                        speechLines: speechLines.slice(),
                        speechIdxs: speechIdxs.slice(),
                        positionInScene: replikaCounterInScene,
                        segmentIndex: null,
                        indexInSegment: null
                    };

                    blocksScene.push(block);
                    i = k - 1;
                }
            }

            for (let i = 0; i < n; i++) {
                if (types[i] === "unknown") {
                    types[i] = "action";
                }
            }

            let segments = [];
            let currentSeg = null;
            let segCounter = 0;

            for (let bIndex = 0; bIndex < blocksScene.length; bIndex++) {
                let blk = blocksScene[bIndex];
                let needNewSeg = false;

                if (bIndex === 0) {
                    needNewSeg = true;
                } else {
                    let prevBlk = blocksScene[bIndex - 1];
                    let hasActionBetween = false;

                    for (let li = prevBlk.endLine + 1; li < blk.headerLine; li++) {
                        if (types[li] === "action") {
                            hasActionBetween = true;
                            break;
                        }
                    }

                    if (hasActionBetween) {
                        needNewSeg = true;
                    }
                }

                if (needNewSeg) {
                    if (currentSeg) {
                        segments.push(currentSeg);
                    }
                    segCounter++;
                    currentSeg = {
                        index: segCounter,
                        blocks: []
                    };
                }

                blk.segmentIndex = segCounter;
                blk.indexInSegment = currentSeg.blocks.length + 1;
                currentSeg.blocks.push(blk);

                roleMap[blk.role].blocks.push(blk);
            }

            if (currentSeg) {
                segments.push(currentSeg);
            }

            scene.types = types;
            scene.blocks = blocksScene;
            scene.segments = segments;
        });

        return {
            scenes: scenes,
            roleMap: roleMap
        };
    }

    let dajUloge = function () {
        let parsed = parseScript();
        return Object.keys(parsed.roleMap);
    };

    function editDistance(a, b) {
        let m = a.length;
        let n = b.length;
        let dp = new Array(m + 1);
        for (let i = 0; i <= m; i++) {
            dp[i] = new Array(n + 1);
        }
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                let cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }
        return dp[m][n];
    }

    let pogresnaUloga = function () {
        let parsed = parseScript();
        let roleMap = parsed.roleMap;
        let names = Object.keys(roleMap);

        let sumnjive = new Set();

        for (let i = 0; i < names.length; i++) {
            let A = names[i];
            let countA = roleMap[A].count;

            for (let j = 0; j < names.length; j++) {
                if (i === j) continue;
                let B = names[j];
                let countB = roleMap[B].count;

                if (countB < 4) continue;
                if (countB < countA + 3) continue;

                let sA = A.replace(/\s+/g, "");
                let sB = B.replace(/\s+/g, "");
                let dist = editDistance(sA, sB);
                let maxLen = Math.max(sA.length, sB.length);
                let threshold = maxLen <= 5 ? 1 : 2;

                if (dist <= threshold) {
                    sumnjive.add(A);
                    break;
                }
            }
        }

        return names.filter(n => sumnjive.has(n));
    };

    let brojLinijaTeksta = function (uloga) {
        if (!uloga) return 0;

        let parsed = parseScript();
        let roleMap = parsed.roleMap;
        let target = uloga.trim().toUpperCase();

        let canonical = null;
        for (let name in roleMap) {
            if (name.toUpperCase() === target) {
                canonical = name;
                break;
            }
        }
        if (!canonical) return 0;

        let total = 0;
        let roleData = roleMap[canonical];
        roleData.blocks.forEach(block => {
            total += block.speechLines.length;
        });

        return total;
    };

    let scenarijUloge = function (uloga) {
        if (!uloga) return [];

        let parsed = parseScript();
        let roleMap = parsed.roleMap;
        let target = uloga.trim().toUpperCase();

        let canonical = null;
        for (let name in roleMap) {
            if (name.toUpperCase() === target) {
                canonical = name;
                break;
            }
        }
        if (!canonical) return [];

        let result = [];

        parsed.scenes.forEach(scene => {
            scene.segments.forEach(seg => {
                let blocks = seg.blocks;
                for (let i = 0; i < blocks.length; i++) {
                    let blk = blocks[i];
                    if (blk.role !== canonical) continue;

                    let prevBlk = i > 0 ? blocks[i - 1] : null;
                    let nextBlk = i < blocks.length - 1 ? blocks[i + 1] : null;

                    let stavka = {
                        scena: scene.title,
                        pozicijaUTekstu: blk.positionInScene,
                        prethodni: prevBlk
                            ? {
                                uloga: prevBlk.role,
                                linije: prevBlk.speechLines.join("\n")
                            }
                            : null,
                        trenutni: {
                            uloga: blk.role,
                            linije: blk.speechLines.join("\n")
                        },
                        sljedeci: nextBlk
                            ? {
                                uloga: nextBlk.role,
                                linije: nextBlk.speechLines.join("\n")
                            }
                            : null
                    };

                    result.push(stavka);
                }
            });
        });

        return result;
    };
}