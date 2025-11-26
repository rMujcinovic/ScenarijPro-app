let EditorTeksta = function(divRef) {
    if (!divRef || divRef.tagName !== "DIV") {
        throw new Error ("Pogresan tip elementa!");
    }
    if (divRef.getAttribute("contenteditable") !== "true") {
        throw new Error ("Neispravan DIV, ne posjeduje contenteditable atribut!");
    }
    
}