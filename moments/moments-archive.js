(() => {
'use strict';
window.MOMENTS_ARCHIVE={
 setup(enabled){document.getElementById('archive-options').hidden=!enabled;document.getElementById('upload-archive').checked=true;this.updateConsent();},
 updateConsent(){const enabled=!document.getElementById('archive-options').hidden;document.getElementById('archive-consent-label').hidden=!enabled;document.getElementById('archive-consent').required=enabled;},
 fields(){if(!document.getElementById('archive-consent').checked)throw Error('请确认同意以群主 B站账号公开发布');return {archiveRequested:true,archiveConsent:'bilibili-public-v1'};}
};
document.getElementById('upload-form').addEventListener('reset',()=>setTimeout(()=>window.MOMENTS_ARCHIVE.updateConsent(),0));
})();
