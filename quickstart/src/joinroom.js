'use strict';

const {connect, createLocalVideoTrack, Logger, LocalVideoTrack} = require('twilio-video');
const {isMobile} = require('./browser');


const $leave = $('#leave-room');
const $room = $('#room');
const $activeParticipant = $('div#active-participant > div.participant.main', $room);
const $activeVideo = $('video', $activeParticipant);
const $participants = $('div#participants', $room);

// The current active Participant in the Room.
let activeParticipant = null;

// Whether the user has selected the active Participant by clicking on
// one of the video thumbnails.
let isActiveParticipantPinned = false;

/**
 * Set the active Participant's video.
 * @param participant - the active Participant
 */
function setActiveParticipant(participant) {
    if (activeParticipant) {
        const $activeParticipant = $(`div#${activeParticipant.sid}`, $participants);
        $activeParticipant.removeClass('active');
        $activeParticipant.removeClass('pinned');

        // Detach any existing VideoTrack of the active Participant.
        const {track: activeTrack} = Array.from(activeParticipant.videoTracks.values())[0] || {};
        if (activeTrack) {
            activeTrack.detach($activeVideo.get(0));
            $activeVideo.css('opacity', '0');
        }
    }

    // Set the new active Participant.
    activeParticipant = participant;
    const {identity, sid} = participant;
    const $participant = $(`div#${sid}`, $participants);

    $participant.addClass('active');
    if (isActiveParticipantPinned) {
        $participant.addClass('pinned');
    }

    // Attach the new active Participant's video.
    const {track} = Array.from(participant.videoTracks.values())[0] || {};
    if (track) {
        track.attach($activeVideo.get(0));
        $activeVideo.css('opacity', '');
    }

    // Set the new active Participant's identity
    $activeParticipant.attr('data-identity', identity);
}

/**
 * Set the current active Participant in the Room.
 * @param room - the Room which contains the current active Participant
 */
function setCurrentActiveParticipant(room) {
    const {dominantSpeaker, localParticipant} = room;
    setActiveParticipant(dominantSpeaker || localParticipant);
}

/**
 * Set up the Participant's media container.
 * @param participant - the Participant whose media container is to be set up
 * @param room - the Room that the Participant joined
 */
function setupParticipantContainer(participant, room) {
    const {identity, sid} = participant;

    // Add a container for the Participant's media.
    const $container = $(`<div class="participant" data-identity="${identity}" id="${sid}">
    <audio autoplay ${participant === room.localParticipant ? 'muted' : ''} style="opacity: 0"></audio>
    <video autoplay muted playsinline height="400" width="700" style="opacity: 0"></video>
    <video autoplay muted playsinline height="400" width="700" style="opacity: 0"></video>

    </div>`);

    // Toggle the pinning of the active Participant's video.
    $container.on('click', () => {
        if (activeParticipant === participant && isActiveParticipantPinned) {
            // Unpin the RemoteParticipant and update the current active Participant.
            setVideoPriority(participant, null);
            isActiveParticipantPinned = false;
            setCurrentActiveParticipant(room);
        } else {
            // Pin the RemoteParticipant as the active Participant.
            if (isActiveParticipantPinned) {
                setVideoPriority(activeParticipant, null);
            }
            setVideoPriority(participant, 'high');
            isActiveParticipantPinned = true;
            setActiveParticipant(participant);
        }
    });

    // Add the Participant's container to the DOM.
    $participants.append($container);
}

/**
 * Set the VideoTrack priority for the given RemoteParticipant. This has no
 * effect in Peer-to-Peer Rooms.
 * @param participant - the RemoteParticipant whose VideoTrack priority is to be set
 * @param priority - null | 'low' | 'standard' | 'high'
 */
function setVideoPriority(participant, priority) {
    participant.videoTracks.forEach(publication => {
        const track = publication.track;
        if (track && track.setPriority) {
            track.setPriority(priority);
        }
    });
}

/**
 * Attach a Track to the DOM.
 * @param track - the Track to attach
 * @param participant - the Participant which published the Track
 */
function attachTrack(track, participant) {
    console.log('attachTrack', track)
    // Attach the Participant's Track to the thumbnail.

    const $media = $(`div#${participant.sid} > ${track.kind}`, $participants);
    $media.css('opacity', '');
    if ($media.get(0).srcObject == null) {
        console.log('media0')
        track.attach($media.get(0));
    } else if ($media.get(1).srcObject == null) {
        console.log('media1');
        track.attach($media.get(1));
    } 


    // If the attached Track is a VideoTrack that is published by the active
    // Participant, then attach it to the main video as well.
    if (track.kind === 'video' && participant === activeParticipant) {
        track.attach($activeVideo.get(0));
        $activeVideo.css('opacity', '');
    }
}

/**
 * Detach a Track from the DOM.
 * @param track - the Track to be detached
 * @param participant - the Participant that is publishing the Track
 */
function detachTrack(track, participant) {
    // Detach the Participant's Track from the thumbnail.
    const $media = $(`div#${participant.sid} > ${track.kind}`, $participants);
    $media.css('opacity', '0');
    track.detach($media.get(0));

    // If the detached Track is a VideoTrack that is published by the active
    // Participant, then detach it from the main video as well.
    if (track.kind === 'video' && participant === activeParticipant) {
        track.detach($activeVideo.get(0));
        $activeVideo.css('opacity', '0');
    }
}

/**
 * Handle the Participant's media.
 * @param participant - the Participant
 * @param room - the Room that the Participant joined
 */
function participantConnected(participant, room) {
    // Set up the Participant's media container.
    setupParticipantContainer(participant, room);

    // Handle the TrackPublications already published by the Participant.
    participant.tracks.forEach(publication => {
        console.log('remote trackPublished already ' + publication)
        trackPublished(publication, participant);
    });

    // Handle theTrackPublications that will be published by the Participant later.
    participant.on('trackPublished', publication => {
        console.log('remote trackPublished later ' + publication)
        trackPublished(publication, participant);
    });
}

/**
 * Handle a disconnected Participant.
 * @param participant - the disconnected Participant
 * @param room - the Room that the Participant disconnected from
 */
function participantDisconnected(participant, room) {
    // If the disconnected Participant was pinned as the active Participant, then
    // unpin it so that the active Participant can be updated.
    if (activeParticipant === participant && isActiveParticipantPinned) {
        isActiveParticipantPinned = false;
        setCurrentActiveParticipant(room);
    }

    // Remove the Participant's media container.
    $(`div#${participant.sid}`, $participants).remove();
}

/**
 * Handle to the TrackPublication's media.
 * @param publication - the TrackPublication
 * @param participant - the publishing Participant
 */
function trackPublished(publication, participant) {
    // If the TrackPublication is already subscribed to, then attach the Track to the DOM.
    if (publication.track) {
        attachTrack(publication.track, participant);
    }

    // Once the TrackPublication is subscribed to, attach the Track to the DOM.
    publication.on('subscribed', track => {
        console.log('subscribed track')
        attachTrack(track, participant);
    });

    // Once the TrackPublication is unsubscribed from, detach the Track from the DOM.
    publication.on('unsubscribed', track => {
        detachTrack(track, participant);
    });
}


function loadBodyPix(video) {
    console.log('loadBodyPix')
    let options = {
        multiplier: 0.75,
        stride: 32,
        quantBytes: 4
    }
    bodyPix.load(options)
      .then(net => perform(net, video))
      .catch(err => console.log(err))
}

async function perform(net, video) {
    let canvas = document.getElementById('blurCanvas')
    console.log("performing bodyPix.......")
    while (true) {
        const segmentation = await net.segmentPerson(video);
        const backgroundBlurAmount = 15;
        const edgeBlurAmount = 20;
        const flipHorizontal = true;
        // canvas.hidden=true
        video.hidden = true;
        bodyPix.drawBokehEffect(
          canvas, video, segmentation, backgroundBlurAmount,
          edgeBlurAmount, flipHorizontal);
    }
}

/**
 * Join a Room.
 * @param token - the AccessToken used to join a Room
 * @param connectOptions - the ConnectOptions used to join a Room
 */






var recognizing = false;
var final_transcript = ''
var two_line = /\n\n/g;
var one_line = /\n/g;
function linebreak(s) {
    return s.replace(two_line, '<p></p>').replace(one_line, '<br>');
}


function draw() {
    var ctx = document.getElementById('imgcanvas').getContext('2d');
    var img = new Image();
    img.onload = function() {
      console.log('image on load')
      ctx.drawImage(img, 0, 0);
      ctx.beginPath();
      ctx.moveTo(30, 96);
      ctx.lineTo(70, 66);
      ctx.lineTo(103, 76);
      ctx.lineTo(170, 15);
      ctx.stroke();
    };
    img.src = 'https://mdn.mozillademos.org/files/5395/backdrop.png';
  }

async function joinRoom(token, connectOptions) {
    console.log('joinRoom')
    await showPDF('somepdf.pdf')
    const logger = Logger.getLogger('twilio-video');
    logger.setLevel('info');


    // var recognition = new webkitSpeechRecognition();
    // recognition.continuous = true;
    // recognition.interimResults = true;
    //
    // recognition.onstart = function () {
    //     console.log('recognition onstart')
    //     recognizing = true;
    // };
    //
    // recognition.onerror = function (event) {
    //     console.log('recognition onerror')
    // };
    //
    // recognition.onend = function () {
    //     console.log('recognition onend')
    //     recognizing = false;
    // };
    //
    // recognition.onresult = function (event) {
    //     var interim_transcript = '';
    //     for (var i = event.resultIndex; i < event.results.length; ++i) {
    //         if (event.results[i].isFinal) {
    //             final_transcript += event.results[i][0].transcript;
    //         } else {
    //             interim_transcript += event.results[i][0].transcript;
    //         }
    //     }
    //     interim_span.innerHTML = linebreak(interim_transcript);
    //
    // };
    // recognition.start();


    // connectOptions.video = false
    connectOptions.bandwidthProfile.video.mode = 'presentation'
    connectOptions.bandwidthProfile.video.clientTrackSwitchOffControl = 'manual'
    connectOptions.bandwidthProfile.video.contentPreferencesMode = 'manual'
    // Join to the Room with the given AccessToken and ConnectOptions.
    console.log('connectOptions', connectOptions)
    const room = await connect(token, connectOptions);
    // room.localParticipant.videoTracks.forEach((track) => track.unpublish())

    window.room = room;

    // let blurVideo = document.getElementById('blurVideo')
    // let mainVideo = document.getElementById('mainVideo')
    // mainVideo.hidden = true;
    // const localCameraStream = await navigator.mediaDevices.getUserMedia({
    //   video: true,
    //   audio: false,
    // })
    //
    // window.stream = localCameraStream;
    // blurVideo.srcObject = localCameraStream
    // blurVideo.play()


    // setTimeout(() => {loadBodyPix(blurVideo)}, 2000);

    // let blurCanvas = document.getElementById('blurCanvas')
    // let blurCanvasStream = blurCanvas.captureStream(30)

    // const localBlurCanvasTrack = new LocalVideoTrack(blurCanvasStream.getVideoTracks()[0])
    // await room.localParticipant.publishTrack(localBlurCanvasTrack)


    // blurVideo.srcObject = docCanvasStream
    // blurVideo.play();
    // const localBlurCanvasTrack = new LocalVideoTrack(blurVideo.srcObject.getTracks()[0])
    // await room.localParticipant.publishTrack(localBlurCanvasTrack)

    let docCanvas = document.querySelector('#pdf-canvas')
    
    console.log('mydebug', docCanvas)
    const docCanvasStream = docCanvas.captureStream(25)
    console.log('mydebug ', docCanvasStream)

    const localDocCanvasTrack = new LocalVideoTrack(docCanvasStream.getVideoTracks()[0], {name: 'magicmode'})
    console.log('docCanvasStream.getVideoTracks()[0]', docCanvasStream.getVideoTracks()[0])
    console.log('localDocCanvasTrack', localDocCanvasTrack)
    await room.localParticipant.publishTrack(localDocCanvasTrack.mediaStreamTrack, {
        priority: 'high'
    })


    
    participantConnected(room.localParticipant, room);

    // draw();
    // var imgCanvas = document.getElementById('imgcanvas');
    // let imgStream = imgCanvas.captureStream(20);
    // const imageCanvasTrack = new LocalVideoTrack(imgStream.getVideoTracks()[0], {name: 'imgStream'})
    // console.log('imgStream.getVideoTracks()[0]', imgStream.getVideoTracks()[0])

    // await room.localParticipant.publishTrack(imageCanvasTrack.mediaStreamTrack, {
    //     priority: 'high'
    // })
    // let itr = room.localParticipant.videoTracks.values()
    // console.log('after publishTrack', itr.next())
    // console.log('after publishTrack' , itr.next())
    // console.log('after publishTrack' , itr.next())


    // Subscribe to the media published by RemoteParticipants already in the Room.
    room.participants.forEach(participant => {
        participantConnected(participant, room);
    });

    // Subscribe to the media published by RemoteParticipants joining the Room later.
    room.on('participantConnected', participant => {
        console.log('participantConnected')
        participantConnected(participant, room);
    });

    // Handle a disconnected RemoteParticipant.
    room.on('participantDisconnected', participant => {
        participantDisconnected(participant, room);
    });

    // Set the current active Participant.
    setCurrentActiveParticipant(room);

    // Update the active Participant when changed, only if the user has not
    // pinned any particular Participant as the active Participant.
    room.on('dominantSpeakerChanged', () => {
        if (!isActiveParticipantPinned) {
            setCurrentActiveParticipant(room);
        }
    });

    // Leave the Room when the "Leave Room" button is clicked.
    $leave.click(function onLeave() {
        $leave.off('click', onLeave);
        room.disconnect();
    });

    return new Promise((resolve, reject) => {
        // Leave the Room when the "beforeunload" event is fired.
        window.onbeforeunload = () => {
            room.disconnect();
        };

        if (isMobile) {
            // TODO(mmalavalli): investigate why "pagehide" is not working in iOS Safari.
            // In iOS Safari, "beforeunload" is not fired, so use "pagehide" instead.
            window.onpagehide = () => {
                room.disconnect();
            };

            // On mobile browsers, use "visibilitychange" event to determine when
            // the app is backgrounded or foregrounded.
            document.onvisibilitychange = async () => {
                if (document.visibilityState === 'hidden') {
                    console.log('unpublishTrack')

                    // When the app is backgrounded, your app can no longer capture
                    // video frames. So, stop and unpublish the LocalVideoTrack.
                    localVideoTrack.stop();
                    room.localParticipant.unpublishTrack(localVideoTrack);
                } else {
                    // When the app is foregrounded, your app can now continue to
                    // capture video frames. So, publish a new LocalVideoTrack.
                    console.log('createLocalVideoTrack')
                    localVideoTrack = await createLocalVideoTrack(connectOptions.video);
                    await room.localParticipant.publishTrack(localVideoTrack);
                }
            };
        }

        room.once('disconnected', (room, error) => {
            // Clear the event handlers on document and window..
            window.onbeforeunload = null;
            if (isMobile) {
                window.onpagehide = null;
                document.onvisibilitychange = null;
            }

            // Stop the LocalVideoTrack.
            localVideoTrack.stop();

            // Handle the disconnected LocalParticipant.
            participantDisconnected(room.localParticipant, room);

            // Handle the disconnected RemoteParticipants.
            room.participants.forEach(participant => {
                participantDisconnected(participant, room);
            });

            // Clear the active Participant's video.
            $activeVideo.get(0).srcObject = null;

            // Clear the Room reference used for debugging from the JavaScript console.
            window.room = null;

            if (error) {
                // Reject the Promise with the TwilioError so that the Room selection
                // modal (plus the TwilioError message) can be displayed.
                reject(error);
            } else {
                // Resolve the Promise so that the Room selection modal can be
                // displayed.
                resolve();
            }
        });
    });
}


var _PDF_DOC,
  _CURRENT_PAGE,
  _TOTAL_PAGES,
  _PAGE_RENDERING_IN_PROGRESS = 0,
  _CANVAS = document.querySelector('#pdf-canvas');

// initialize aznd load the PDF
async function showPDF(pdf_url) {
    document.querySelector("#pdf-loader").style.display = 'block';

    // get handle of pdf document
    try {
        _PDF_DOC = await pdfjsLib.getDocument({url: pdf_url});
    } catch (error) {
        alert(error.message);
    }

    // total pages in pdf
    _TOTAL_PAGES = _PDF_DOC.numPages;

    // Hide the pdf loader and show pdf container
    document.querySelector("#pdf-loader").style.display = 'none';
    document.querySelector("#pdf-contents").style.display = 'block';
    document.querySelector("#pdf-total-pages").innerHTML = _TOTAL_PAGES;

    // show the first page
    await showPage(1);
}

// load and render specific page of the PDF
async function showPage(page_no) {
    _PAGE_RENDERING_IN_PROGRESS = 1;
    _CURRENT_PAGE = page_no;

    // disable Previous & Next buttons while page is being loaded
    document.querySelector("#pdf-next").disabled = true;
    document.querySelector("#pdf-prev").disabled = true;

    // while page is being rendered hide the canvas and show a loading message
    document.querySelector("#pdf-canvas").style.display = 'none';
    document.querySelector("#page-loader").style.display = 'block';

    // update current page
    document.querySelector("#pdf-current-page").innerHTML = page_no;

    // get handle of page
    try {
        var page = await _PDF_DOC.getPage(page_no);
    } catch (error) {
        alert(error.message);
    }

    // original width of the pdf page at scale 1
    var pdf_original_width = page.getViewport({scale: 1}).width;

    // as the canvas is of a fixed width we need to adjust the scale of the viewport where page is rendered
    var scale_required = _CANVAS.width / pdf_original_width;

    // get viewport to render the page at required scale
    var viewport = page.getViewport({scale: scale_required});

    // set canvas height same as viewport height
    _CANVAS.height = viewport.height;

    // setting page loader height for smooth experience
    document.querySelector("#page-loader").style.height = _CANVAS.height + 'px';
    document.querySelector("#page-loader").style.lineHeight = _CANVAS.height + 'px';

    // page is rendered on <canvas> element
    var render_context = {
        canvasContext: _CANVAS.getContext('2d' ,{ alpha: false }),
        viewport: viewport
    };

    // render the page contents in the canvas
    try {
        await page.render(render_context);
    } catch (error) {
        alert(error.message);
    }

    _PAGE_RENDERING_IN_PROGRESS = 0;

    // re-enable Previous & Next buttons
    document.querySelector("#pdf-next").disabled = false;
    document.querySelector("#pdf-prev").disabled = false;

    // show the canvas and hide the page loader
    document.querySelector("#pdf-canvas").style.display = 'block';
    document.querySelector("#page-loader").style.display = 'none';
}

// click on "Show PDF" buuton
document.querySelector("#show-pdf-button").addEventListener('click', function () {
    this.style.display = 'none';
    showPDF('https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf');
});

// click on the "Previous" page button
document.querySelector("#pdf-prev").addEventListener('click', function () {
    if (_CURRENT_PAGE != 1)
        showPage(--_CURRENT_PAGE);
});

// click on the "Next" page button
document.querySelector("#pdf-next").addEventListener('click', function () {
    if (_CURRENT_PAGE != _TOTAL_PAGES)
        showPage(++_CURRENT_PAGE);
});

module.exports = joinRoom;
