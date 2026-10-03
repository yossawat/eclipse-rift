/* Eclipse Rift — boot: build the 3D portraits, then show the title. */
(async function () {
  const UI = window.ERUI;
  const P = window.ERProfile;
  const A3 = window.ERArt3D;
  UI.setScreen('title', '<div class="splash"><h1 class="logo"><span>ECLIPSE</span><b>RIFT</b></h1><p class="m-sub">กำลังปั้นตัวละคร 3D…</p></div>');
  if (A3) A3.enabled = P.data.art3d !== false;
  if (A3 && P.data.art3d !== false) {
    const timeout = new Promise((r) => setTimeout(() => r(false), 9000));
    await Promise.race([A3.init(), timeout]);
  }
  UI.showTitle();
})();
