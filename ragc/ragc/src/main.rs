use crossbeam_channel::bounded;
use ctrlc;
use env_logger;
use log::error;
extern crate clap;

use ragc_binaries;
use ragc_core::{cpu, mem};
use ragc_peripherals;

pub const ROM_BANKS_NUM: usize = 36;
pub const ROM_BANK_NUM_WORDS: usize = 1024;

fn fetch_config<'a>() -> clap::ArgMatches<'a> {
    let about = "RAGC ";
    let c = clap::App::new("RAGC")
        .version("0.1")
        .about(about)
        .subcommand(clap::SubCommand::with_name("retread50").help("Run AGC with RETREAD50"));
    let a = c.get_matches();
    a
}

fn main() {
    env_logger::init();
    let (ctrlc_tx, ctrlc_rx) = bounded(1);
    let res = ctrlc::set_handler(move || {
        if ctrlc_tx.is_full() == true {
            std::process::exit(-1);
        }
        let _res = ctrlc_tx.send(());
    });

    match res {
        Err(x) => {
            error!("Unable to register signal handler. {:?}.", x);
            return;
        }
        _ => {}
    }

    let matches = fetch_config();
    let rope = match matches.subcommand_name() {
        Some("retread50") => *ragc_binaries::RETREAD50_ROPE,
        _ => {
            error!("Invalid subcommand. Exiting");
            return;
        }
    };

    let mut q1 = heapless::spsc::Queue::new();
    let (rupt_tx, _rupt_rx) = q1.split();

    let mut dsky = ragc_peripherals::dsky::DskyDisplay::new();
    let mut downrupt = ragc_peripherals::downrupt::DownruptPeriph::new();

    let mm = mem::MemoryMap::new(&rope, &mut downrupt, &mut dsky, rupt_tx);
    let mut _cpu = cpu::AgcCpu::new(mm);

    _cpu.reset();
    let mut last_timestamp = std::time::Instant::now();
    loop {
        // Check to see if we received a ctrlc signal
        if ctrlc_rx.len() > 0 {
            break;
        }

        if last_timestamp.elapsed().as_millis() == 0 {
            std::thread::sleep(std::time::Duration::new(0, 5000000));
            continue;
        }

        let mut cycle_counter = 0;
        let expected_cycles = ((last_timestamp.elapsed().as_micros() as f64) / 11.7) as i64;
        while cycle_counter < expected_cycles {
            cycle_counter += _cpu.step() as i64;
        }
        last_timestamp = std::time::Instant::now();
    }
}
