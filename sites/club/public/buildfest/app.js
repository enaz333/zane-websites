const copyButton=document.getElementById('copy-code');
copyButton.addEventListener('click',async()=>{
 const code=document.getElementById('promo-code').textContent;
 const status=document.getElementById('copy-status');
 try{await navigator.clipboard.writeText(code);status.textContent='Code copied!';copyButton.setAttribute('aria-label','Pro activation code copied');}
 catch{status.textContent='Select and copy the code above.';const range=document.createRange();range.selectNodeContents(document.getElementById('promo-code'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
});
const promptButton=document.getElementById('copy-prompt');
promptButton.addEventListener('click',async()=>{
 const prompt=document.getElementById('starter-prompt');const status=document.getElementById('prompt-status');
 try{await navigator.clipboard.writeText(prompt.textContent);status.textContent='Message copied!';}
 catch{status.textContent='Select and copy the message above.';const range=document.createRange();range.selectNodeContents(prompt);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
});
