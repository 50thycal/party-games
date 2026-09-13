/** Call directly from a user click so Safari retains share-sheet activation. */
export async function saveMarkdownReport(report:string,filename:string,share=true):Promise<void> {
  const file=new File([report],filename,{type:'text/plain;charset=utf-8'});
  if(share&&navigator.canShare?.({files:[file]})) {
    try {await navigator.share({files:[file]});return;}
    catch(error) {if(error instanceof Error&&error.name==='AbortError') return;throw error;}
  }
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');link.href=url;link.download=filename;
  document.body.appendChild(link);link.click();link.remove();
  // Safari needs time to consume the blob after the click.
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
