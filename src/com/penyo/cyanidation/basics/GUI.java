/* 
 * Copyright (c) Penyo. All rights reserved.
 */

package com.penyo.cyanidation.basics;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Desktop;
import java.awt.FileDialog;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GridLayout;
import java.awt.Label;
import java.awt.TextArea;
import java.awt.event.KeyEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.FileInputStream;
import java.net.URI;

import javax.swing.Box;
import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JMenu;
import javax.swing.JMenuBar;
import javax.swing.JMenuItem;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;

/**
 * 该类定义友好的用户图形界面。
 * 
 * @author Penyo
 */
public class GUI {
    private String version;

    public GUI(String version) {
        this.version = version;
        init();
        setLayout();
        actionRegist();
    }

    private Core c = new Core();

    private JFrame frame = new JFrame("Cyanidation");
    private JPanel csEntireBody = new JPanel(null),
            xAxis = new JPanel(new GridLayout(1, 7, 0, 0)),
            yAxis = new JPanel(new GridLayout(5, 1, 0, 0)),
            csInfoBody = new JPanel(new GridLayout(5, 7, 0, 0)),
            bottomBar = new JPanel(new GridLayout(1, 3, 0, 0)),
            bottomCtrl = new JPanel();
    private JLabel weekNow = new JLabel("  第 " + (c.getWeek() + c.weekSkewing) + " 周（当前周）"),
            sentence = new JLabel(c.getSentence() + "  ", JLabel.RIGHT);
    private JButton lastWeek = new JButton("上一周"),
            reflash = new JButton("回滚"),
            nextWeek = new JButton("下一周");
    private JMenuBar topBar = new JMenuBar();
    private JMenu file = new JMenu("文件"),
            help = new JMenu("帮助");
    private JMenuItem newCS = new JMenuItem("新建课程表", KeyEvent.VK_N),
            openStandardCS = new JMenuItem("打开课程表", KeyEvent.VK_O),
            getSRC = new JMenuItem("获取源代码"),
            about = new JMenuItem("关于");
    private JDialog newCSguide = new JDialog(frame, "课程表编辑器", false),
            aboutGuide = new JDialog(frame, "关于我们", false);
    private FileDialog open = new FileDialog(frame, "Open your CS file", FileDialog.LOAD),
            saveAs = new FileDialog(frame, "Save your CS file", FileDialog.SAVE);

    private JLabel upGuide = new JLabel("请按照下面给出的格式编纂课程表：");
    private JTextArea typeArea = new JTextArea("""
            Title@TermBeginningDate
            $Subject1@Teacher1
            DayOfWeek, PhaseOfDay - WeekBeginning, WeekEnd@Classroom1
            DOW, POD - WB, WE@C2
            DOW, POD - WB, WE@C3
            $S2@T2
            DOW, POD - WB, WE@C4
            DOW, POD - WB, WE@C5
            DOW, POD - WB, WE@C6
            $S3@T3
            DOW, POD - WB, WE@C7
            DOW, POD - WB, WE@C8
            DOW, POD - WB, WE@C9""");
    private JScrollPane jsp = new JScrollPane(typeArea);
    private JPanel newOperation = new JPanel(new FlowLayout(FlowLayout.RIGHT));
    private JButton readDefaultSample = new JButton("阅读案例"),
            saveCSas = new JButton("保存");

    private Box textAbout = Box.createVerticalBox();
    private JLabel title = new JLabel(),
            subtitle = new JLabel("To be the lightest classschedule."),
            copyright = new JLabel("Copyright (c) Penyo. All rights reserved.");
    private JPanel quitAboutCtrl = new JPanel(new FlowLayout(FlowLayout.RIGHT));
    private JButton quitAbout = new JButton("确定");

    private String path = null;
    private boolean userDoes = true;

    private void init() {
        xAxis.add(new JLabel("Mon", JLabel.CENTER));
        xAxis.add(new JLabel("Tue", JLabel.CENTER));
        xAxis.add(new JLabel("Wes", JLabel.CENTER));
        xAxis.add(new JLabel("Thu", JLabel.CENTER));
        xAxis.add(new JLabel("Fri", JLabel.CENTER));
        xAxis.add(new JLabel("Sat", JLabel.CENTER));
        xAxis.add(new JLabel("Sun", JLabel.CENTER));

        yAxis.add(new JLabel("1", JLabel.CENTER));
        yAxis.add(new JLabel("2", JLabel.CENTER));
        yAxis.add(new JLabel("3", JLabel.CENTER));
        yAxis.add(new JLabel("4", JLabel.CENTER));
        yAxis.add(new JLabel("5", JLabel.CENTER));

        bottomCtrl.add(lastWeek);
        bottomCtrl.add(reflash);
        bottomCtrl.add(nextWeek);

        bottomBar.add(weekNow);
        bottomBar.add(bottomCtrl);
        bottomBar.add(sentence);

        reflash(null);

        csEntireBody.add(xAxis);
        csEntireBody.add(yAxis);
        csEntireBody.add(csInfoBody);

        frame.add(csEntireBody);
        frame.add(bottomBar, BorderLayout.SOUTH);

        file.add(newCS);
        file.add(openStandardCS);
        help.add(getSRC);
        help.add(about);
        topBar.add(file);
        topBar.add(help);
        frame.setJMenuBar(topBar);

        newCSguide.add(upGuide, BorderLayout.NORTH);
        newCSguide.add(jsp);
        newOperation.add(readDefaultSample);
        newOperation.add(saveCSas);
        newCSguide.add(newOperation, BorderLayout.SOUTH);

        textAbout.add(title);
        textAbout.add(subtitle);
        for (int i = 0; i < 5; i++)
            textAbout.add(new Label(""));
        textAbout.add(copyright);
        aboutGuide.add(new Label(), BorderLayout.WEST);
        aboutGuide.add(textAbout);
        quitAboutCtrl.add(quitAbout);
        aboutGuide.add(quitAboutCtrl, BorderLayout.SOUTH);
    }

    private void setLayout() {
        frame.setSize(1280, 720);
        frame.setResizable(false);
        frame.setVisible(true);

        int edge = 10, axisShortEdge = 30, width = csEntireBody.getWidth(), height = csEntireBody.getHeight();
        xAxis.setBounds(edge + axisShortEdge, edge, width - edge * 2 - axisShortEdge, axisShortEdge);
        yAxis.setBounds(edge, edge + axisShortEdge, axisShortEdge, height - edge * 2 - axisShortEdge);
        csInfoBody.setBounds(edge + axisShortEdge, edge + axisShortEdge, width - edge * 2 - axisShortEdge,
                height - edge * 2 - axisShortEdge);

        csEntireBody.setBackground(Color.LIGHT_GRAY);
        bottomBar.setBackground(Color.GRAY);
        bottomCtrl.setBackground(Color.GRAY);

        newCSguide.setSize(720, 405);
        newCSguide.setResizable(false);

        typeArea.setFont(new Font(Font.SANS_SERIF, Font.ITALIC, 11));

        aboutGuide.setSize(480, 270);
        aboutGuide.setResizable(false);
        title.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 24));
        subtitle.setFont(new Font(Font.SANS_SERIF, Font.ITALIC, 10));
    }

    private void actionRegist() {
        newCS.addActionListener(e -> newCSguide.setVisible(true));
        readDefaultSample.addActionListener(e -> {
            try (FileInputStream ioCS = new FileInputStream(c.defaultPath);) {
                byte[] parsedCS_I = new byte[ioCS.available()];
                ioCS.read(parsedCS_I);
                typeArea.setText(new String(parsedCS_I));
                userDoes = false;
            } catch (Exception e1) {
                e1.printStackTrace();
            }
        });
        openStandardCS.addActionListener(e -> {
            open.setVisible(true);
            if (open.getFile() != null) {
                path = open.getDirectory() + open.getFile();
                reflash(path);
            }
        });
        lastWeek.addActionListener(e -> {
            if (c.getWeek() + c.weekSkewing > 1)
                c.weekSkewing--;
            reflash(path);
            weekNow.setText("  第 " + (c.getWeek() + c.weekSkewing) + " 周");
        });
        reflash.addActionListener(e -> {
            c.weekSkewing = 0;
            reflash(path);
            weekNow.setText("  第 " + (c.getWeek() + c.weekSkewing) + " 周（当前周）");
        });
        nextWeek.addActionListener(e -> {
            if (c.getWeek() + c.weekSkewing < c.weekLimit)
                c.weekSkewing++;
            reflash(path);
            weekNow.setText("  第 " + (c.getWeek() + c.weekSkewing) + " 周");
        });
        getSRC.addActionListener(e -> {
            try {
                Desktop.getDesktop().browse(new URI("https://github.com/penyoofficial/Cyanidation"));
            } catch (Exception e1) {
                e1.printStackTrace();
            }
        });
        about.addActionListener(e -> {
            title.setText("Cyanidation " + version);
            aboutGuide.setVisible(true);
        });
        typeArea.addPropertyChangeListener(e -> {
            if (userDoes)
                typeArea.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
            else {
                typeArea.setFont(new Font(Font.SANS_SERIF, Font.ITALIC, 11));
                userDoes = true;
            }
        });
        saveCSas.addActionListener(e -> {
            saveAs.setVisible(true);
            if (saveAs.getDirectory() != null && saveAs.getFile() != null) {
                c.save(saveAs.getDirectory() + saveAs.getFile(), typeArea.getText());
                newCSguide.setVisible(false);
                return;
            }
        });
        quitAbout.addActionListener(e -> aboutGuide.setVisible(false));
        frame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                System.exit(0);
            }
        });
        newCSguide.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                newCSguide.setVisible(false);
            }
        });
        aboutGuide.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                aboutGuide.setVisible(false);
            }
        });
    }

    private void reflash(String path) {
        csInfoBody.removeAll();
        String[] standardCS = c.reflash(path);
        frame.setTitle("Cyanidation - " + c.csGist[0]);
        for (int i = 0; i < 35; i++) {
            TextArea classUnit = new TextArea(standardCS[i], 0, 0, TextArea.SCROLLBARS_NONE);
            classUnit.setEditable(false);
            csInfoBody.add(classUnit);
        }
        frame.setVisible(false);
        frame.setVisible(true);
    }
}
