// Every option name, long and short, that Vim or Neovim has (:help
// option-list, Vim 9.1 and Neovim 0.11). apply_vimrc uses it to tell an option
// we do not have (skipped, the vimrc is fine in terminal Vim) from a typo
// (error). It has no t_ names, vimrc.ts skips those by prefix.
export const vim_option_names: ReadonlySet<string> = new Set(
  `
  acd ai akm al aleph allowrevins altkeymap ambiwidth ambw anti antialias ar
  arab arabic arabicshape ari arshape asd autochdir autoindent autoread
  autoshelldir autowrite autowriteall aw awa background backspace backup
  backupcopy backupdir backupext backupskip balloondelay ballooneval
  balloonevalterm balloonexpr bdir bdlay belloff beval bevalterm bex bexpr
  bg bh bin binary biosk bioskey bk bkc bl bo bomb breakat breakindent
  breakindentopt bri briopt brk browsedir bs bsdir bsk bt bufhidden
  buflisted buftype casemap cb cc ccv cd cdh cdhome cdpath cedit cf cfu ch
  channel charconvert ci cia cin cindent cink cinkeys cino cinoptions
  cinscopedecls cinsd cinw cinwords clipboard cm cmdheight cmdwinheight cmp
  cms co cocu cole colorcolumn columns com comments commentstring compatible
  complete completefunc completeitemalign completeopt completepopup
  completeslash concealcursor conceallevel confirm consk conskey copyindent
  cot cp cpo cpoptions cpp cpt crb cryptmethod cscopepathcomp cscopeprg
  cscopequickfix cscoperelative cscopetag cscopetagorder cscopeverbose csl
  cspc csprg csqf csre cst csto csverb cuc cul culopt cursorbind
  cursorcolumn cursorline cursorlineopt cwh debug deco def define delcombine
  dex dg dict dictionary diff diffexpr diffopt digraph dip dir directory
  display dy ea ead eadirection eb ed edcompatible ef efm ei eiw ek emo
  emoji enc encoding endoffile endofline eof eol ep equalalways equalprg
  errorbells errorfile errorformat esckeys et eventignore eventignorewin ex
  expandtab exrc fcl fcs fdc fde fdi fdl fdls fdm fdn fdo fdt fen fenc fencs
  fex ff ffs ffu fic fileencoding fileencodings fileformat fileformats
  fileignorecase filetype fillchars findfunc fixendofline fixeol fk fkmap
  flp fml fmr fo foldclose foldcolumn foldenable foldexpr foldignore
  foldlevel foldlevelstart foldmarker foldmethod foldminlines foldnestmax
  foldopen foldtext formatexpr formatlistpat formatoptions formatprg fp fs
  fsync ft gcr gd gdefault gfm gfn gfs gfw ghr gli go gp grepformat grepprg
  gtl gtt guicursor guifont guifontset guifontwide guiheadroom guiligatures
  guioptions guipty guitablabel guitabtooltip helpfile helpheight helplang
  hf hh hi hid hidden highlight history hk hkmap hkmapp hkp hl hlg hls
  hlsearch ic icm icon iconstring ignorecase im imactivatefunc imactivatekey
  imaf imak imc imcmdline imd imdisable imi iminsert ims imsearch imsf imst
  imstatusfunc imstyle inc inccommand include includeexpr incsearch inde
  indentexpr indentkeys indk inex inf infercase insertmode is isf isfname
  isi isident isk iskeyword isp isprint joinspaces jop js jumpoptions key
  keymap keymodel keyprotocol keywordprg km kmp kp kpc langmap langmenu
  langnoremap langremap laststatus lazyredraw lbr lcs linebreak lines
  linespace lisp lispoptions lispwords list listchars lm lmap lnr
  loadplugins lop lpl lrm ls lsp luadll lw lz ma macatsui magic makeef
  makeencoding makeprg mat matchpairs matchtime maxcombine maxfuncdepth
  maxmapdepth maxmem maxmempattern maxmemtot mco mef menc menuitems
  messagesopt mfd mh mis mkspellmem ml mle mls mm mmd mmp mmt mod modeline
  modelineexpr modelines modifiable modified mopt more mouse mousef
  mousefocus mousehide mousem mousemev mousemodel mousemoveevent mouses
  mousescroll mouseshape mouset mousetime mp mps msm mzq mzquantum
  mzschemedll mzschemegcdll nf nrformats nu number numberwidth nuw odev oft
  ofu omnifunc opendevice operatorfunc opfunc osfiletype pa packpath para
  paragraphs paste pastetoggle patchexpr patchmode path pb pdev penc perldll
  pex pexpr pfn ph pheader pi pm pmbcs pmbfn popt pp preserveindent
  previewheight previewpopup previewwindow printdevice printencoding
  printexpr printfont printheader printmbcharset printmbfont printoptions
  prompt pt pumblend pumheight pumwidth pvh pvp pvw pw pythondll pythonhome
  pythonthreedll pythonthreehome pyx pyxversion qe qftf quickfixtextfunc
  quoteescape rdb rdt re readonly redrawdebug redrawtime regexpengine
  relativenumber remap renderoptions report restorescreen revins ri
  rightleft rightleftcmd rl rlc rnu ro rop rs rtp ru rubydll ruf ruler
  rulerformat runtimepath sb sbo sbr sc scb scbk scf scl scr scroll
  scrollback scrollbind scrollfocus scrolljump scrolloff scrollopt scs sd
  sdf sect sections secure sel selection selectmode sessionoptions sft sh
  shada shadafile shcf shell shellcmdflag shellpipe shellquote shellredir
  shellslash shelltemp shelltype shellxescape shellxquote shiftround
  shiftwidth shm shortmess shortname showbreak showcmd showcmdloc
  showfulltag showmatch showmode showtabline shq si sidescroll sidescrolloff
  signcolumn siso sj slm sloc sm smartcase smartindent smarttab smc smd
  smoothscroll sms sn so softtabstop sol sp spc spell spellcapcheck
  spellfile spelllang spelloptions spellsuggest spf spk spl splitbelow
  splitkeep splitright spo spr sps sr srr ss ssl ssop st sta stal
  startofline statuscolumn statusline stc stl stmp sts su sua suffixes
  suffixesadd sw swapfile swapsync swb swf switchbuf sws sxe sxq syn
  synmaxcol syntax ta tabclose tabline tabpagemax tabstop tag tagbsearch
  tagcase tagfunc taglength tagrelative tags tagstack tal tb tbi tbidi tbis
  tbs tc tcl tcldll tenc term termbidi termencoding termguicolors
  termpastefilter termsync termwinkey termwinscroll termwinsize termwintype
  terse textauto textmode textwidth tf tfu tgc tgst thesaurus thesaurusfunc
  tildeop timeout timeoutlen title titlelen titleold titlestring tl tm to
  toolbar toolbariconsize top tpf tpm tr ts tsl tsr tsrfu ttimeout
  ttimeoutlen ttm tty ttybuiltin ttyfast ttym ttymouse ttyscroll ttytype tw
  twk tws twsl twt tx uc udf udir ul undodir undofile undolevels undoreload
  updatecount updatetime ur ut varsofttabstop vartabstop vb vbs vdir ve
  verbose verbosefile vfile vi viewdir viewoptions vif viminfo viminfofile
  virtualedit visualbell vop vsts vts wa wak warn wb wbr wc wcm wcr wd
  weirdinvert wfb wfh wfw wh whichwrap wi wic wig wildchar wildcharm
  wildignore wildignorecase wildmenu wildmode wildoptions wim winaltkeys
  winbar winbl winblend winborder wincolor window winfixbuf winfixheight
  winfixwidth winheight winhighlight winhl winminheight winminwidth
  winptydll winwidth wiv wiw wm wmh wmnu wmw wop wrap wrapmargin wrapscan
  write writeany writebackup writedelay ws ww xtermcodes
  `
    .split(/\s+/)
    .filter(Boolean),
);
