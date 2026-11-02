//参考 canvasについて
//  (canvas.width, canvas.height):
//      キャンバスが内部で持っている画像データの幅,高さ
//  (canvas.style.width, canvas.style.height):
//      実際にキャンバスが表示される大きさ
//
//  （例）canvas.style.width=400px canvas.width=200pxの場合は、横に2倍して表示される
//  （例）canvas.style.height=150px canvas.height=300pxの場合は、縦に1/2倍して表示される

//コンストラクタの引数：手書きキャンバスのId名,手書きキャンバスのクリアボタンのId名
//使用例  drawcan1=new TMamHandwritten("canvasID1","clearButtonId1");
//        drawcan2=new TMamHandwritten("canvasID2","clearButtonId2");

function TMamHandwritten(drawCanvasId,clearButtonId){
  'use strict';
  this.drawCanvasId=drawCanvasId;
  this.clearButtonId=clearButtonId;
  this.isMouseDown=false;
  this.penColor="#000000";   // ペンの色
  this.penWidth=5;           // ペンの太さ
  this.eraser=false;         // 消しゴムモード
  
  //マウス、タップの座標
  this.position=[];
  this.position.x=0;
  this.position.y=0;
  this.position.px=0;
  this.position.py=0;
  //横比率,縦比率
  this.rate=[]; this.rate.x=0; this.rate.y=0;
  this.can=null;
  this.ctx=null;
  this.clearButton=null;
  window.addEventListener("DOMContentLoaded",function(){
    this.can=document.getElementById(this.drawCanvasId);
    //イベントの設定
    this.can.addEventListener("touchstart",this.onDown.bind(this),{passive: false});
    this.can.addEventListener("touchmove",this.onMove.bind(this),{passive: false});
    this.can.addEventListener("touchend",this.onUp.bind(this));
    this.can.addEventListener("mousedown",this.onMouseDown.bind(this));
    this.can.addEventListener("mousemove",this.onMouseMove.bind(this));
    this.can.addEventListener("mouseup",this.onMouseUp.bind(this));
    window.addEventListener("mousemove",this.stopShake.bind(this));
    this.ctx=this.can.getContext("2d");
    //クリアボタンの設定
    if(document.getElementById(this.clearButtonId)){
      this.clearButton=document.getElementById(this.clearButtonId);

      this.clearButton.addEventListener("click",function(){
      this.ctx.fillStyle="rgb(255,255,255)";
      this.ctx.fillRect(0,0,this.can.width,this.can.height);
      }.bind(this));
    }
    
    //スタイルシートの登録（MSのIE11、iOSのSafariでドラッグ時に画面が揺れないように）
    let style=document.createElement("style");
    document.head.appendChild(style);
    style.sheet.insertRule('canvas#'+this.drawCanvasId+'{-ms-touch-action:none;touch-action:none;}',0);
    let s=window.getComputedStyle(this.can);
    //canvas.widthとcanvas.style.widthの比率を取得する
    this.rate.x=parseInt(this.can.width)/parseInt(s.width);
    //canvas.heightとcanvas.style.heightの比率を取得する
    this.rate.y=parseInt(this.can.height)/parseInt(s.height);
  }.bind(this));

  //TouchStart時
  this.onDown=function(event){
    this.isMouseDown=true;
    this.position.px=event.touches[0].pageX-event.target.getBoundingClientRect().left-this.getScrollPosition().x;
    this.position.py=event.touches[0].pageY-event.target.getBoundingClientRect().top -this.getScrollPosition().y;
    this.position.x=this.position.px;
    this.position.y=this.position.py;
    this.drawLine();
    event.preventDefault();
    event.stopPropagation();
  }
  //TouchMove時
  this.onMove=function(event){
    if(this.isMouseDown){
      this.position.x=event.touches[0].pageX-event.target.getBoundingClientRect().left-this.getScrollPosition().x;
      this.position.y=event.touches[0].pageY-event.target.getBoundingClientRect().top -this.getScrollPosition().y;
      this.drawLine();
      this.position.px=this.position.x;
      this.position.py=this.position.y;
      event.stopPropagation();
    };
  }
  //TouchEnd時
  this.onUp=function(event){
    this.isMouseDown=false;
    event.stopPropagation();
  }
  //MouseDown時
  this.onMouseDown=function(event){
    this.position.px=event.clientX-event.target.getBoundingClientRect().left;
    this.position.py=event.clientY-event.target.getBoundingClientRect().top ;
    this.position.x=this.position.px;
    this.position.y=this.position.py;
    this.drawLine();
    this.isMouseDown=true;
    event.stopPropagation();
  }
  //MouseMove時
  this.onMouseMove=function(event){
    if(this.isMouseDown){
      this.position.x=event.clientX-event.target.getBoundingClientRect().left;
      this.position.y=event.clientY-event.target.getBoundingClientRect().top ;
      this.drawLine();
      this.position.px=this.position.x;
      this.position.py=this.position.y;
      event.stopPropagation();
    }
  }
  //MouseUp時
  this.onMouseUp=function(event){
    this.isMouseDown=false;
    event.stopPropagation();
  }
  this.stopShake=function(event){
    this.isMouseDown=false;
    event.stopPropagation();
  }

  //表示サイズと内部サイズの比率を、現在の表示状態から再計算する
this.updateRate=function(){
  let r=this.can.getBoundingClientRect();
  this.rate.x=this.can.width/r.width;
  this.rate.y=this.can.height/r.height;
}

  this.drawLine=function(){
    this.updateRate();   // ← 追加
        this.ctx.strokeStyle=this.eraser ? "#ffffff" : this.penColor;   // 消しゴムは白
    this.ctx.lineWidth=this.eraser ? 40 : this.penWidth;            // 消しゴムは太く
    this.ctx.lineJoin="round";
    this.ctx.lineCap="round";
    this.ctx.beginPath();
    this.ctx.moveTo(this.position.px*this.rate.x,this.position.py*this.rate.y);
    this.ctx.lineTo(this.position.x*this.rate.x,this.position.y*this.rate.y);
    this.ctx.stroke();
  }


  //スクロール位置を取得する
  this.getScrollPosition=function(){
    return {
      "x":document.documentElement.scrollLeft || document.body.scrollLeft,
      "y":document.documentElement.scrollTop  || document.body.scrollTop
    };
  }
  //手書き画像をPNG形式でData URIスキーム(base64)を使って文字列に変換してPOSTする場合
  this.savePicture=function(postURL){
    let imgPng=this.can.toDataURL('image/png');
    //imgPng=imgPng.replace(/^data:image\/png;base64,/,'');
    let fm=document.createElement("form");
    fm.setAttribute("method","post");      //メソッド
    fm.setAttribute("action",postURL);  //POST先
    let h=document.createElement("input");
    h.setAttribute("type","hidden");
    h.setAttribute("value",imgPng);
    h.setAttribute("name","imgpng");
    fm.appendChild(h);
    document.body.appendChild(fm);
    fm.submit();
  }
}
